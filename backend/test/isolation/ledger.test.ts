import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '../../src/shared/tenant-context/index.js';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  pgCode,
  pgMessage,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des paiements et des répartitions (lot 2.4, base migrée) : payments (tenant_isolation, subscriber_self_read,
 * subscriber_declare), allocations (tenant_isolation, subscriber_self_read, subscriber_propose), clés composites
 * (association, inscription, personne, moyen de paiement), déclencheurs payments_guard et allocations_guard. Chaque
 * politique est aussi testée affaiblie.
 */

const PROJECTS = {
  a: '00000000-0000-7000-8000-00000000c401',
  b: '00000000-0000-7000-8000-00000000c402',
} as const;

const METHODS = {
  orangeA: '00000000-0000-7000-8000-0000000aa401',
  bankB: '00000000-0000-7000-8000-0000000aa402',
} as const;

/** Inscriptions : Moussa et Aminata dans A, Fatou dans B. */
const ENROLLMENTS = {
  moussa: '00000000-0000-7000-8000-00000000e401',
  aminata: '00000000-0000-7000-8000-00000000e402',
  fatou: '00000000-0000-7000-8000-00000000e403',
} as const;

const INSTALLMENTS = {
  /** Déclarée : 25 000 F en attente (paiement `moussa`). */
  moussa1: '00000000-0000-7000-8000-00000000d401',
  /** Payée : paiement validé `moussaValidated`. */
  moussa2: '00000000-0000-7000-8000-00000000d402',
  /** Libre. */
  moussa3: '00000000-0000-7000-8000-00000000d403',
  aminata1: '00000000-0000-7000-8000-00000000d404',
  /** Libre. */
  aminata2: '00000000-0000-7000-8000-00000000d406',
  fatou1: '00000000-0000-7000-8000-00000000d405',
} as const;

const PAYMENTS = {
  moussa: '00000000-0000-7000-8000-0000000fa401',
  moussaValidated: '00000000-0000-7000-8000-0000000fa402',
  aminata: '00000000-0000-7000-8000-0000000fa403',
  fatou: '00000000-0000-7000-8000-0000000fa404',
} as const;

const ALLOCATIONS = {
  moussa: '00000000-0000-7000-8000-0000000ab401',
  moussaValidated: '00000000-0000-7000-8000-0000000ab402',
  aminata: '00000000-0000-7000-8000-0000000ab403',
  fatou: '00000000-0000-7000-8000-0000000ab404',
} as const;

/** Fichiers : preuves de paiement (non rattachées ou rattachées à une association) et un export de B. */
const FILES = {
  /** Preuve de Moussa, pas encore rattachée (dépôt en espace subscriber). */
  proofMoussa: '00000000-0000-7000-8000-0000000f1401',
  /** Preuve de Moussa rattachée à A. */
  proofMoussaInA: '00000000-0000-7000-8000-0000000f1402',
  /** Preuve de Moussa rattachée à B. */
  proofMoussaInB: '00000000-0000-7000-8000-0000000f1403',
  /** Preuve d'Aminata, pas encore rattachée. */
  proofAminata: '00000000-0000-7000-8000-0000000f1404',
  /** Export de B (autre usage). */
  exportB: '00000000-0000-7000-8000-0000000f1405',
  /** Inconnu. */
  unknown: '00000000-0000-7000-8000-0000000f14ff',
} as const;

const ids = (table: 'payments' | 'allocations') => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));
const paymentIds = ids('payments');
const allocationIds = ids('allocations');

interface PaymentRow {
  id: string;
  association: string;
  project: string;
  enrollment: string;
  user: string;
  method?: string | null;
  status?: string;
  amountReceived?: number | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  rejectionCode?: string | null;
  rejectionMessage?: string | null;
  version?: number;
  /** Par défaut : l'instant de la transaction (valeur par défaut de la colonne). */
  declaredAt?: string;
  proof?: string | null;
  idempotencyKey?: string;
}

const insertPayment = (tx: Tx, p: PaymentRow) =>
  tx.execute(sql`INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared,
                                       amount_received, paid_on, payment_method_id, transaction_reference, proof_file_id,
                                       status, reviewed_by, reviewed_at, rejection_reason_code, rejection_message,
                                       version, declared_at, idempotency_key)
                 VALUES (${p.id}, ${p.association}, ${p.project}, ${p.enrollment}, ${p.user}, 25000,
                         ${p.amountReceived ?? null}, '2026-10-01', ${p.method ?? null}, 'OM-1', ${p.proof ?? null},
                         ${p.status ?? 'pending'}, ${p.reviewedBy ?? null}, ${p.reviewedAt ?? null},
                         ${p.rejectionCode ?? null}, ${p.rejectionMessage ?? null}, ${p.version ?? 1},
                         coalesce(${p.declaredAt ?? null}::timestamptz, now()), ${p.idempotencyKey ?? `k-${p.id}`})`);

interface AllocationRow {
  id: string;
  association: string;
  payment: string;
  installment: string;
  enrollment: string;
  state?: string;
}

const insertAllocation = (tx: Tx, a: AllocationRow) =>
  tx.execute(sql`INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state)
                 VALUES (${a.id}, ${a.association}, ${a.payment}, ${a.installment}, ${a.enrollment}, 25000,
                         ${a.state ?? 'proposed'})`);

/** Déclaration valide de Moussa (espace subscriber), absente du jeu de données. */
const MOUSSA_DECLARATION: PaymentRow = {
  id: '00000000-0000-7000-8000-0000000fa4f1',
  association: A.id,
  project: PROJECTS.a,
  enrollment: ENROLLMENTS.moussa,
  user: USERS.moussa,
  method: METHODS.orangeA,
};

/** Proposition valide de Moussa sur son paiement en attente, sur une échéance libre. */
const MOUSSA_PROPOSAL: AllocationRow = {
  id: '00000000-0000-7000-8000-0000000ab4f1',
  association: A.id,
  payment: PAYMENTS.moussa,
  installment: INSTALLMENTS.moussa3,
  enrollment: ENROLLMENTS.moussa,
};

const PROJECT_INSERT = `INSERT INTO projects (id, association_id, name, description, status, installment_amount,
                                              frequency, due_day, schedule_type, start_date, end_date, created_by)
                        VALUES ($1, $2, $3, '', 'active', 25000, 'monthly', 5, 'fixed', '2026-03-01', '2027-08-31', $4)`;

describe('isolation : payments et allocations (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a, A.id, 'Centre A', USERS.awa]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.b, B.id, 'Projet B', USERS.koffi]);
    await h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label) VALUES
         ($1, $3, 'mobile_money', 'Orange Money'), ($2, $4, 'bank_transfer', 'SGBCI')`,
      [METHODS.orangeA, METHODS.bankB, A.id, B.id],
    );
    for (const [enrollment, association, project, user] of [
      [ENROLLMENTS.moussa, A.id, PROJECTS.a, USERS.moussa],
      [ENROLLMENTS.aminata, A.id, PROJECTS.a, USERS.aminata],
      [ENROLLMENTS.fatou, B.id, PROJECTS.b, USERS.fatou],
    ] as const) {
      await h.superuser(
        `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
         VALUES ($1, $2, $3, $4, 'active', '2026-03-01', now())`,
        [enrollment, association, project, user],
      );
    }
    for (const [installment, association, project, enrollment, user, sequence, paid, pending] of [
      [INSTALLMENTS.moussa1, A.id, PROJECTS.a, ENROLLMENTS.moussa, USERS.moussa, 1, 0, 25000],
      [INSTALLMENTS.moussa2, A.id, PROJECTS.a, ENROLLMENTS.moussa, USERS.moussa, 2, 25000, 0],
      [INSTALLMENTS.moussa3, A.id, PROJECTS.a, ENROLLMENTS.moussa, USERS.moussa, 3, 0, 0],
      [INSTALLMENTS.aminata1, A.id, PROJECTS.a, ENROLLMENTS.aminata, USERS.aminata, 1, 0, 25000],
      [INSTALLMENTS.aminata2, A.id, PROJECTS.a, ENROLLMENTS.aminata, USERS.aminata, 2, 0, 0],
      [INSTALLMENTS.fatou1, B.id, PROJECTS.b, ENROLLMENTS.fatou, USERS.fatou, 1, 0, 25000],
    ] as const) {
      await h.superuser(
        `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                   amount_due, amount_paid, amount_pending)
         VALUES ($1, $2, $3, $4, $5, 'periodic', $6, '2026-03-05', 25000, $7, $8)`,
        [installment, association, project, enrollment, user, sequence, paid, pending],
      );
    }
    for (const [file, association, owner, purpose] of [
      [FILES.proofMoussa, null, USERS.moussa, 'payment_proof'],
      [FILES.proofMoussaInA, A.id, USERS.moussa, 'payment_proof'],
      [FILES.proofMoussaInB, B.id, USERS.moussa, 'payment_proof'],
      [FILES.proofAminata, null, USERS.aminata, 'payment_proof'],
      [FILES.exportB, B.id, USERS.koffi, 'export'],
    ] as const) {
      await h.superuser(
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                            size_bytes)
         VALUES ($1, $2, $3, $4, 'cotiz', $5, 'preuve.jpg', 'image/jpeg', 1000)`,
        [file, association, owner, purpose, `proofs/${file}`],
      );
    }
    // Un seul bloc : le paiement validé doit avoir ses allocations confirmées au COMMIT (déclencheur différé).
    await h.superuser(
      `BEGIN;
       INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                             transaction_reference, status, reviewed_by, reviewed_at, idempotency_key) VALUES
         ('${PAYMENTS.moussa}', '${A.id}', '${PROJECTS.a}', '${ENROLLMENTS.moussa}', '${USERS.moussa}', 25000,
          '2026-10-01', 'OM-1', 'pending', NULL, NULL, 'seed-1'),
         ('${PAYMENTS.moussaValidated}', '${A.id}', '${PROJECTS.a}', '${ENROLLMENTS.moussa}', '${USERS.moussa}', 25000,
          '2026-04-01', 'OM-2', 'validated', '${USERS.awa}', now(), 'seed-2'),
         ('${PAYMENTS.aminata}', '${A.id}', '${PROJECTS.a}', '${ENROLLMENTS.aminata}', '${USERS.aminata}', 25000,
          '2026-10-01', 'OM-3', 'pending', NULL, NULL, 'seed-3'),
         ('${PAYMENTS.fatou}', '${B.id}', '${PROJECTS.b}', '${ENROLLMENTS.fatou}', '${USERS.fatou}', 25000,
          '2026-10-01', 'OM-4', 'pending', NULL, NULL, 'seed-4');
       INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state) VALUES
         ('${ALLOCATIONS.moussa}', '${A.id}', '${PAYMENTS.moussa}', '${INSTALLMENTS.moussa1}', '${ENROLLMENTS.moussa}',
          25000, 'proposed'),
         ('${ALLOCATIONS.moussaValidated}', '${A.id}', '${PAYMENTS.moussaValidated}', '${INSTALLMENTS.moussa2}',
          '${ENROLLMENTS.moussa}', 25000, 'confirmed'),
         ('${ALLOCATIONS.aminata}', '${A.id}', '${PAYMENTS.aminata}', '${INSTALLMENTS.aminata1}',
          '${ENROLLMENTS.aminata}', 25000, 'proposed'),
         ('${ALLOCATIONS.fatou}', '${B.id}', '${PAYMENTS.fatou}', '${INSTALLMENTS.fatou1}', '${ENROLLMENTS.fatou}',
          25000, 'proposed');
       COMMIT;`,
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('espace association', () => {
    it('chaque gestionnaire ne voit que les paiements et les répartitions de son association', async () => {
      await h.as(asManagerOf(A), async (tx) => {
        expect(await paymentIds(tx)).toEqual([PAYMENTS.moussa, PAYMENTS.moussaValidated, PAYMENTS.aminata]);
        expect(await allocationIds(tx)).toEqual([ALLOCATIONS.moussa, ALLOCATIONS.moussaValidated, ALLOCATIONS.aminata]);
      });
      await h.as(asManagerOf(B), async (tx) => {
        expect(await paymentIds(tx)).toEqual([PAYMENTS.fatou]);
        expect(await allocationIds(tx)).toEqual([ALLOCATIONS.fatou]);
      });
    });

    it('un gestionnaire de A n’écrit ni paiement ni répartition dans B', async () => {
      for (const write of [
        (tx: Tx) =>
          insertPayment(tx, {
            id: '00000000-0000-7000-8000-0000000fa4f2',
            association: B.id,
            project: PROJECTS.b,
            enrollment: ENROLLMENTS.fatou,
            user: USERS.fatou,
          }),
        (tx: Tx) =>
          insertAllocation(tx, {
            id: '00000000-0000-7000-8000-0000000ab4f2',
            association: B.id,
            payment: PAYMENTS.fatou,
            installment: INSTALLMENTS.fatou1,
            enrollment: ENROLLMENTS.fatou,
          }),
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), write));
        expect(isRlsViolation(error)).toBe(true);
      }
    });

    it('un paiement reprend l’association, le projet et la personne de son inscription, et un moyen de son association', async () => {
      const base = { id: '00000000-0000-7000-8000-0000000fa4f3', association: A.id, project: PROJECTS.a };
      for (const row of [
        // Inscription d'une autre association.
        { ...base, enrollment: ENROLLMENTS.fatou, user: USERS.fatou },
        // Autre personne que celle de l'inscription.
        { ...base, enrollment: ENROLLMENTS.moussa, user: USERS.aminata },
        // Autre projet que celui de l'inscription.
        { ...base, project: PROJECTS.b, enrollment: ENROLLMENTS.moussa, user: USERS.moussa },
        // Moyen de paiement d'une autre association.
        { ...base, enrollment: ENROLLMENTS.moussa, user: USERS.moussa, method: METHODS.bankB },
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insertPayment(tx, row)));
        expect({ row, code: pgCode(error) }).toEqual({ row, code: '23503' });
      }
    });

    it('une répartition porte sur une échéance de l’inscription de son paiement', async () => {
      const base = { id: '00000000-0000-7000-8000-0000000ab4f3', association: A.id, payment: PAYMENTS.moussa };
      for (const row of [
        // Échéance d'Aminata (même association) pour le paiement de Moussa, sous l'inscription de Moussa…
        { ...base, installment: INSTALLMENTS.aminata1, enrollment: ENROLLMENTS.moussa },
        // … ou sous celle d'Aminata.
        { ...base, installment: INSTALLMENTS.aminata1, enrollment: ENROLLMENTS.aminata },
        // Échéance de B.
        { ...base, installment: INSTALLMENTS.fatou1, enrollment: ENROLLMENTS.moussa },
        // Paiement de B sur une échéance de A.
        { ...base, payment: PAYMENTS.fatou, installment: INSTALLMENTS.moussa3, enrollment: ENROLLMENTS.moussa },
        { ...base, payment: PAYMENTS.fatou, installment: INSTALLMENTS.moussa3, enrollment: ENROLLMENTS.fatou },
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insertAllocation(tx, row)));
        expect({ row, code: pgCode(error) }).toEqual({ row, code: '23503' });
      }
    });

    it('un gestionnaire de A ne modifie rien de B', async () => {
      const results = await h.asRollback(asManagerOf(A), async (tx) => [
        (await tx.execute(sql`UPDATE payments SET amount_received = 1 WHERE id = ${PAYMENTS.fatou}`)).rowCount,
        (await tx.execute(sql`UPDATE allocations SET state = 'voided' WHERE id = ${ALLOCATIONS.fatou}`)).rowCount,
      ]);
      expect(results).toEqual([0, 0]);
    });

    it('ni paiement ni répartition ne se suppriment, même par leur association (données financières)', async () => {
      for (const statement of [
        sql`DELETE FROM payments WHERE id = ${PAYMENTS.aminata}`,
        sql`DELETE FROM allocations WHERE id = ${ALLOCATIONS.aminata}`,
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => tx.execute(statement)));
        expect(pgCode(error)).toBe('42501');
      }
    });
  });

  describe('espace subscriber', () => {
    it('Moussa ne voit que ses paiements et leurs répartitions', async () => {
      await h.as(asSubscriber(USERS.moussa), async (tx) => {
        expect(await paymentIds(tx)).toEqual([PAYMENTS.moussa, PAYMENTS.moussaValidated]);
        expect(await allocationIds(tx)).toEqual([ALLOCATIONS.moussa, ALLOCATIONS.moussaValidated]);
      });
    });

    it('Awa, gestionnaire de A sans paiement à elle : rien en espace subscriber', async () => {
      await h.as(asSubscriber(USERS.awa), async (tx) => {
        expect(await paymentIds(tx)).toEqual([]);
        expect(await allocationIds(tx)).toEqual([]);
      });
    });

    it('Moussa déclare un paiement en attente et propose sa répartition', async () => {
      const ok = await h.asRollback(asSubscriber(USERS.moussa), async (tx) => {
        await insertPayment(tx, MOUSSA_DECLARATION);
        await insertAllocation(tx, {
          ...MOUSSA_PROPOSAL,
          id: '00000000-0000-7000-8000-0000000ab4f4',
          payment: MOUSSA_DECLARATION.id,
        });
        return true;
      });
      expect(ok).toBe(true);
    });

    it.each([
      ['déjà validé', { status: 'validated' }],
      ['déjà rejeté', { status: 'rejected' }],
      ['déjà annulé', { status: 'canceled' }],
      ['avec un montant reçu', { amountReceived: 25000 }],
      ['avec un relecteur', { reviewedBy: USERS.moussa }],
      ['avec une date de relecture', { reviewedAt: '2026-10-01T10:00:00Z' }],
      ['avec un motif de rejet', { rejectionCode: 'other' }],
      ['avec un message de rejet', { rejectionMessage: 'affiché au gestionnaire' }],
      ['en version 2', { version: 2 }],
      // Antidatée, elle passerait en tête de la file de validation (triée sur declared_at).
      ['antidaté', { declaredAt: '2020-01-01T00:00:00Z' }],
      ['pour une autre personne', { user: USERS.aminata, enrollment: ENROLLMENTS.aminata }],
    ] as const)('Moussa ne déclare pas un paiement %s', async (_name, change) => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) => insertPayment(tx, { ...MOUSSA_DECLARATION, ...change })),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('Moussa ne déclare que sur ses propres inscriptions', async () => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertPayment(tx, {
            ...MOUSSA_DECLARATION,
            association: B.id,
            project: PROJECTS.b,
            enrollment: ENROLLMENTS.fatou,
            method: null,
          }),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it.each([
      ['confirmée', { state: 'confirmed' }],
      ['annulée', { state: 'voided' }],
      ['sur son paiement validé', { payment: PAYMENTS.moussaValidated }],
      [
        'sur le paiement d’Aminata',
        { payment: PAYMENTS.aminata, installment: INSTALLMENTS.aminata1, enrollment: ENROLLMENTS.aminata },
      ],
    ] as const)('Moussa ne propose pas de répartition %s', async (_name, change) => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) => insertAllocation(tx, { ...MOUSSA_PROPOSAL, ...change })),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('Moussa ne modifie ni ses paiements ni ses répartitions, même en attente', async () => {
      const results = await h.asRollback(asSubscriber(USERS.moussa), async (tx) => [
        (await tx.execute(sql`UPDATE payments SET status = 'validated' WHERE id = ${PAYMENTS.moussa}`)).rowCount,
        (await tx.execute(sql`UPDATE allocations SET state = 'confirmed' WHERE id = ${ALLOCATIONS.moussa}`)).rowCount,
        (await tx.execute(sql`UPDATE allocations SET state = 'voided' WHERE id = ${ALLOCATIONS.moussaValidated}`))
          .rowCount,
      ]);
      expect(results).toEqual([0, 0, 0]);
    });
  });

  describe('autres espaces', () => {
    it.each([
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['public', { space: 'public' }],
      ['auth', { space: 'auth', userId: USERS.moussa }],
      ['association sans association', { space: 'association', userId: USERS.moussa }],
      ['association où Moussa n’est pas inscrit', { space: 'association', associationId: B.id, userId: USERS.moussa }],
    ] as const)('espace %s : aucun paiement ni répartition de Moussa', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await paymentIds(tx)).not.toContain(PAYMENTS.moussa);
        expect(await allocationIds(tx)).not.toContain(ALLOCATIONS.moussa);
      });
    });

    it('sans contexte, ou sans aucune variable app.* : rien', async () => {
      for (const table of ['payments', 'allocations']) {
        expect({ table, n: await h.count(null, table) }).toEqual({ table, n: 0 });
        expect({ table, n: await h.countWithoutTenantDatabase(table) }).toEqual({ table, n: 0 });
      }
    });

    it('espace system (worker) : aucun paiement, aucune répartition (aucune tâche n’en lit)', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        const count = async (table: string) =>
          (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n;
        return { payments: await count('payments'), allocations: await count('allocations') };
      });
      expect(seen).toEqual({ payments: 0, allocations: 0 });
    });
  });

  describe('déclencheurs : déclaration immuable, transitions de statut (payments_guard, allocations_guard)', () => {
    /**
     * Transaction annulée en cotiz_app, dans le contexte d'un gestionnaire de A. `guards: false` : déclencheurs
     * désactivés le temps de la transaction (preuve que la RLS et les clés seules ne refuseraient pas).
     */
    const run = (statement: string, options: { guards?: boolean } = {}) =>
      h.superuserRollback(async (client) => {
        if (options.guards === false) {
          await client.query('ALTER TABLE payments DISABLE TRIGGER payments_guard');
          await client.query('ALTER TABLE allocations DISABLE TRIGGER allocations_guard');
        }
        await client.query(
          `SELECT set_config('role', 'cotiz_app', true), set_config('app.space', 'association', true),
                  set_config('app.user_id', $1, true), set_config('app.association_id', $2, true)`,
          [USERS.awa, A.id],
        );
        const result = await errorOf(client.query(statement));
        if (result === null) return 'accepted';
        return pgCode(result) === 'P0001' ? pgMessage(result) : result;
      });

    it.each([
      `UPDATE payments SET amount_declared = 30000 WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE payments SET paid_on = '2026-01-01' WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE payments SET transaction_reference = 'autre' WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE payments SET idempotency_key = 'autre' WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE payments SET declared_at = now() - interval '1 day' WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE payments SET enrollment_id = '${ENROLLMENTS.aminata}', user_id = '${USERS.aminata}' WHERE id = '${PAYMENTS.moussa}'`,
      // Vers B : refusé par le déclencheur avant même la RLS et la clé composite.
      `UPDATE payments SET association_id = '${B.id}', project_id = '${PROJECTS.b}', enrollment_id = '${ENROLLMENTS.fatou}',
         user_id = '${USERS.fatou}' WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE allocations SET amount = 20000 WHERE id = '${ALLOCATIONS.moussa}'`,
      `UPDATE allocations SET installment_id = '${INSTALLMENTS.moussa3}' WHERE id = '${ALLOCATIONS.moussa}'`,
      `UPDATE allocations SET payment_id = '${PAYMENTS.moussaValidated}' WHERE id = '${ALLOCATIONS.moussa}'`,
    ])('déclaration immuable : %s', async (statement) => {
      expect(await run(statement)).toBe('forbidden_update');
    });

    it.each([
      `UPDATE payments SET status = 'rejected' WHERE id = '${PAYMENTS.moussaValidated}'`,
      `UPDATE payments SET status = 'canceled' WHERE id = '${PAYMENTS.moussaValidated}'`,
      `UPDATE allocations SET state = 'confirmed' WHERE id = '${ALLOCATIONS.moussa}'`,
      `UPDATE allocations SET state = 'proposed' WHERE id = '${ALLOCATIONS.moussaValidated}'`,
    ])('transition refusée : %s', async (statement) => {
      expect(await run(statement)).toBe('invalid_state');
    });

    it('un paiement rejeté ne revient jamais et ne change plus (statut, motif, montant reçu, relecteur)', async () => {
      for (const set of [
        `status = 'pending'`,
        `status = 'validated'`,
        `rejection_message = 'autre'`,
        `rejection_reason_code = 'other'`,
        `amount_received = 1`,
        `reviewed_by = '${USERS.koffi}'`,
      ]) {
        const outcome = await h.superuserRollback(async (client) => {
          await client.query(
            `UPDATE payments SET status = 'rejected', reviewed_by = $2, reviewed_at = now(),
                                 rejection_reason_code = 'not_received' WHERE id = $1`,
            [PAYMENTS.aminata, USERS.awa],
          );
          return errorOf(client.query(`UPDATE payments SET ${set} WHERE id = $1`, [PAYMENTS.aminata]));
        });
        expect({ set, message: pgMessage(outcome) }).toEqual({ set, message: 'invalid_state' });
      }
    });

    it.each([
      // Validation (§ 4.5) : montant reçu, relecture, propositions annulées.
      `UPDATE payments SET amount_received = 20000, reviewed_by = '${USERS.awa}', reviewed_at = now(),
         version = version + 1 WHERE id = '${PAYMENTS.moussa}'`,
      `UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussa}'`,
      // Rejet.
      `UPDATE payments SET status = 'rejected', rejection_reason_code = 'not_received', rejection_message = 'x',
         reviewed_by = '${USERS.awa}', reviewed_at = now() WHERE id = '${PAYMENTS.aminata}'`,
      // Annulation d'une validation : validated → pending, allocations confirmées annulées.
      `UPDATE payments SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
         WHERE id = '${PAYMENTS.moussaValidated}'`,
      `UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussaValidated}'`,
    ])('écriture du registre acceptée : %s', async (statement) => {
      expect(await run(statement)).toBe('accepted');
    });

    it('sans les déclencheurs, le gestionnaire changerait le montant déclaré et la répartition confirmée', async () => {
      expect(
        await run(`UPDATE payments SET amount_declared = 30000 WHERE id = '${PAYMENTS.moussa}'`, { guards: false }),
      ).toBe('accepted');
      expect(
        await run(
          `UPDATE allocations SET installment_id = '${INSTALLMENTS.moussa3}' WHERE id = '${ALLOCATIONS.moussaValidated}'`,
          {
            guards: false,
          },
        ),
      ).toBe('accepted');
    });
  });

  describe('invariants', () => {
    it('une seule répartition vivante par paiement et par échéance ; une annulée laisse la place', async () => {
      const duplicate = {
        id: '00000000-0000-7000-8000-0000000ab4f5',
        association: A.id,
        payment: PAYMENTS.moussa,
        installment: INSTALLMENTS.moussa1,
        enrollment: ENROLLMENTS.moussa,
      };
      const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insertAllocation(tx, duplicate)));
      expect(pgCode(error)).toBe('23505');

      const replaced = await h.asRollback(asManagerOf(A), async (tx) => {
        await tx.execute(sql`UPDATE allocations SET state = 'voided' WHERE id = ${ALLOCATIONS.moussa}`);
        await insertAllocation(tx, { ...duplicate, state: 'confirmed' });
        return true;
      });
      expect(replaced).toBe(true);
    });

    it('paiement : montant > 0, preuve ou référence obligatoire', async () => {
      for (const set of ['amount_declared = 0', 'amount_received = 0', 'transaction_reference = NULL']) {
        const error = await h.superuserRollback(async (client) => {
          await client.query('ALTER TABLE payments DISABLE TRIGGER payments_guard');
          return errorOf(client.query(`UPDATE payments SET ${set} WHERE id = $1`, [PAYMENTS.moussa]));
        });
        expect({ set, code: pgCode(error) }).toEqual({ set, code: '23514' });
      }
    });

    it('répartition : montant > 0', async () => {
      const error = await h.superuserRollback(async (client) => {
        await client.query('ALTER TABLE allocations DISABLE TRIGGER allocations_guard');
        return errorOf(client.query(`UPDATE allocations SET amount = 0 WHERE id = $1`, [ALLOCATIONS.moussa]));
      });
      expect(pgCode(error)).toBe('23514');
    });

    it('valeurs par défaut : paiement en attente en version 1, répartition proposée', async () => {
      const { rows } = await h.superuserRollback(async (client) => {
        await client.query(
          `INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                                 transaction_reference, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, 25000, '2026-10-01', 'OM-9', 'k-defaults')`,
          [MOUSSA_DECLARATION.id, A.id, PROJECTS.a, ENROLLMENTS.moussa, USERS.moussa],
        );
        await client.query(
          `INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount)
           VALUES ('00000000-0000-7000-8000-0000000ab4f6', $1, $2, $3, $4, 25000)`,
          [A.id, MOUSSA_DECLARATION.id, INSTALLMENTS.moussa3, ENROLLMENTS.moussa],
        );
        return client.query(
          `SELECT p.status, p.version, p.currency, a.state FROM payments p JOIN allocations a ON a.payment_id = p.id
            WHERE p.id = $1`,
          [MOUSSA_DECLARATION.id],
        );
      });
      expect(rows).toEqual([{ status: 'pending', version: 1, currency: 'XOF', state: 'proposed' }]);
    });
  });

  describe('répartitions vérifiées au COMMIT d’après l’état final du paiement (check_payment_allocations)', () => {
    /**
     * Instructions en cotiz_app, gestionnaire de A, puis contrôles différés exécutés comme au COMMIT ; toujours annulé.
     * Renvoie `accepted` ou le message du déclencheur.
     */
    const commit = (...statements: string[]) =>
      h.superuserRollback(async (client) => {
        await client.query(
          `SELECT set_config('role', 'cotiz_app', true), set_config('app.space', 'association', true),
                  set_config('app.user_id', $1, true), set_config('app.association_id', $2, true)`,
          [USERS.awa, A.id],
        );
        for (const statement of [...statements, 'SET CONSTRAINTS ALL IMMEDIATE']) {
          const error = await errorOf(client.query(statement));
          if (error !== null) return pgCode(error) === 'P0001' ? pgMessage(error) : error;
        }
        return 'accepted';
      });

    const confirm = (installment: string, amount = 25000, payment: string = PAYMENTS.moussa) =>
      `INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount, state)
       VALUES (gen_random_uuid(), '${A.id}', '${payment}', '${installment}', '${ENROLLMENTS.moussa}', ${String(amount)},
               'confirmed')`;
    const voidProposal = `UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussa}'`;
    const validate = (set = '') =>
      `UPDATE payments SET status = 'validated', reviewed_by = '${USERS.awa}', reviewed_at = now(),
         version = version + 1 ${set} WHERE id = '${PAYMENTS.moussa}'`;

    it('validation de § 4.5 : propositions annulées, répartition confirmée, paiement validé', async () => {
      expect(await commit(voidProposal, confirm(INSTALLMENTS.moussa1), validate())).toBe('accepted');
    });

    it('validation ajustée avec montant reçu différent, posé avant ou après le statut', async () => {
      expect(
        await commit(voidProposal, confirm(INSTALLMENTS.moussa1, 20000), validate(', amount_received = 20000')),
      ).toBe('accepted');
      // Le contrôle relit le paiement au COMMIT : un montant reçu posé après le statut n'est pas un faux rejet.
      expect(
        await commit(
          voidProposal,
          confirm(INSTALLMENTS.moussa1, 20000),
          validate(),
          `UPDATE payments SET amount_received = 20000 WHERE id = '${PAYMENTS.moussa}'`,
        ),
      ).toBe('accepted');
    });

    it('validé sans le compte : allocation_mismatch', async () => {
      expect(await commit(voidProposal, confirm(INSTALLMENTS.moussa1, 20000), validate())).toBe('allocation_mismatch');
    });

    it('validé en laissant une proposition vivante : invalid_state', async () => {
      expect(await commit(confirm(INSTALLMENTS.moussa3), validate())).toBe('invalid_state');
    });

    it('paiement validé : annuler une confirmation seule, ou en ajouter une, est refusé au COMMIT', async () => {
      expect(await commit(`UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussaValidated}'`)).toBe(
        'allocation_mismatch',
      );
      expect(await commit(confirm(INSTALLMENTS.moussa3, 5000, PAYMENTS.moussaValidated))).toBe('allocation_mismatch');
    });

    it('paiement en attente : aucune répartition confirmée', async () => {
      expect(await commit(confirm(INSTALLMENTS.moussa3))).toBe('invalid_state');
    });

    it('rejet sans annuler les propositions : invalid_state ; en les annulant : accepté', async () => {
      const reject = `UPDATE payments SET status = 'rejected', reviewed_by = '${USERS.awa}', reviewed_at = now(),
                        rejection_reason_code = 'not_received' WHERE id = '${PAYMENTS.aminata}'`;
      expect(await commit(reject)).toBe('invalid_state');
      expect(await commit(`UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.aminata}'`, reject)).toBe(
        'accepted',
      );
    });

    it('annulation compensatoire : validated → pending, confirmations annulées, propositions recréées', async () => {
      expect(
        await commit(
          `UPDATE payments SET status = 'pending', reviewed_by = NULL, reviewed_at = NULL
             WHERE id = '${PAYMENTS.moussaValidated}'`,
          `UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussaValidated}'`,
          `INSERT INTO allocations (id, association_id, payment_id, installment_id, enrollment_id, amount)
           VALUES (gen_random_uuid(), '${A.id}', '${PAYMENTS.moussaValidated}', '${INSTALLMENTS.moussa2}',
                   '${ENROLLMENTS.moussa}', 25000)`,
        ),
      ).toBe('accepted');
    });

    it('sans le contrôle sur allocations, annuler la confirmation d’un paiement validé passerait', async () => {
      const outcome = await h.superuserRollback(async (client) => {
        await client.query('ALTER TABLE allocations DISABLE TRIGGER allocations_payment_check');
        await client.query(`UPDATE allocations SET state = 'voided' WHERE id = $1`, [ALLOCATIONS.moussaValidated]);
        return errorOf(client.query('SET CONSTRAINTS ALL IMMEDIATE'));
      });
      expect(outcome).toBeNull();
    });

    it('relecture : validé ou rejeté sans relecteur, rejeté sans motif → refusé', async () => {
      for (const set of [
        `status = 'validated', reviewed_at = now()`,
        `status = 'validated', reviewed_by = '${USERS.awa}'`,
        `status = 'rejected', reviewed_by = '${USERS.awa}', reviewed_at = now()`,
      ]) {
        const error = await h.superuserRollback((client) =>
          errorOf(client.query(`UPDATE payments SET ${set} WHERE id = $1`, [PAYMENTS.aminata])),
        );
        expect({ set, code: pgCode(error) }).toEqual({ set, code: '23514' });
      }
    });
  });

  describe('preuve : de la personne, ou de l’association du paiement (check_payment_proof)', () => {
    const declare = (context: TenantContext, proof: string) =>
      errorOf(h.asRollback(context, (tx) => insertPayment(tx, { ...MOUSSA_DECLARATION, proof })));

    it.each([
      ['sa preuve pas encore rattachée', FILES.proofMoussa],
      ['sa preuve rattachée à A', FILES.proofMoussaInA],
    ])('Moussa déclare avec %s', async (_name, proof) => {
      expect(await declare(asSubscriber(USERS.moussa), proof)).toBeNull();
    });

    it.each([
      ['la preuve d’Aminata', FILES.proofAminata],
      ['sa preuve rattachée à B', FILES.proofMoussaInB],
      ['un export de B', FILES.exportB],
      // Même refus qu'un fichier existant : aucun oracle d'existence (contrôle avant la clé étrangère).
      ['un identifiant inconnu', FILES.unknown],
    ])('Moussa ne déclare pas avec %s', async (_name, proof) => {
      expect(pgMessage(await declare(asSubscriber(USERS.moussa), proof))).toBe('invalid_proof');
    });

    it('le gestionnaire de A : preuve rattachée à A acceptée ; preuve de B ou export de B refusés', async () => {
      expect(await declare(asManagerOf(A), FILES.proofMoussaInA)).toBeNull();
      for (const proof of [FILES.proofMoussaInB, FILES.exportB]) {
        expect({ proof, message: pgMessage(await declare(asManagerOf(A), proof)) }).toEqual({
          proof,
          message: 'invalid_proof',
        });
      }
    });

    it('sans le déclencheur, Moussa déclarerait avec l’export de B', async () => {
      const outcome = await h.superuserRollback(async (client) => {
        await client.query('ALTER TABLE payments DISABLE TRIGGER payments_proof');
        await client.query(
          `SELECT set_config('role', 'cotiz_app', true), set_config('app.space', 'subscriber', true),
                  set_config('app.user_id', $1, true), set_config('app.association_id', '', true)`,
          [USERS.moussa],
        );
        return errorOf(
          client.query(
            `INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                                   proof_file_id, idempotency_key)
             VALUES ($1, $2, $3, $4, $5, 25000, '2026-10-01', $6, 'k-proof')`,
            [MOUSSA_DECLARATION.id, A.id, PROJECTS.a, ENROLLMENTS.moussa, USERS.moussa, FILES.exportB],
          ),
        );
      });
      expect(outcome).toBeNull();
    });
  });

  describe('droits et clé d’idempotence', () => {
    it.each(['payments', 'allocations', 'installments'])('TRUNCATE %s refusé, même au propriétaire', async (table) => {
      const error = await errorOf(h.migrator(`TRUNCATE ${table} CASCADE`));
      expect(pgMessage(error)).toBe('append_only');
    });

    it('cotiz_platform (BYPASSRLS) n’écrit ni paiement ni répartition', async () => {
      for (const statement of [
        `UPDATE payments SET amount_received = 1 WHERE id = '${PAYMENTS.moussa}'`,
        `UPDATE allocations SET state = 'voided' WHERE id = '${ALLOCATIONS.moussa}'`,
        `INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                               transaction_reference, idempotency_key)
         VALUES ('${MOUSSA_DECLARATION.id}', '${A.id}', '${PROJECTS.a}', '${ENROLLMENTS.moussa}', '${USERS.moussa}',
                 25000, '2026-10-01', 'OM-1', 'k-platform')`,
      ]) {
        const error = await h.superuserRollback(async (client) => {
          await client.query('SET LOCAL ROLE cotiz_platform');
          return errorOf(client.query(statement));
        });
        expect({ statement, code: pgCode(error) }).toEqual({ statement, code: '42501' });
      }
    });

    it('clé d’idempotence unique par personne : réutilisable par une autre personne, pas par la même', async () => {
      const key = 'seed-1'; // celle du paiement en attente de Moussa
      expect(
        await errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            insertPayment(tx, {
              id: '00000000-0000-7000-8000-0000000fa4f4',
              association: A.id,
              project: PROJECTS.a,
              enrollment: ENROLLMENTS.aminata,
              user: USERS.aminata,
              idempotencyKey: key,
            }),
          ),
        ),
      ).toBeNull();
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) => insertPayment(tx, { ...MOUSSA_DECLARATION, idempotencyKey: key })),
      );
      expect(pgCode(error)).toBe('23505');
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    it.each([
      ['payments', paymentIds],
      ['allocations', allocationIds],
    ] as const)('%s.tenant_isolation élargie : le gestionnaire de A voit B', async (table, read) => {
      const seen = await h.withPolicy(table, 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), read),
      );
      expect(seen).toHaveLength(4);
    });

    it.each([
      ['payments', paymentIds],
      ['allocations', allocationIds],
    ] as const)('%s.tenant_isolation retirée : le gestionnaire ne voit plus rien des siens', async (table, read) => {
      expect(await h.withoutPolicy(table, 'tenant_isolation', () => h.as(asManagerOf(A), read))).toEqual([]);
    });

    it.each([
      ['payments', paymentIds],
      ['allocations', allocationIds],
    ] as const)('%s.subscriber_self_read sans condition de personne : Moussa voit les autres', async (table, read) => {
      // allocations lit payments : élargir aussi la lecture des paiements, sinon elle suffirait à protéger.
      const anySubscriber = { using: "app_space() = 'subscriber'", withCheck: null };
      const seen = await h.withPolicy('payments', 'subscriber_self_read', anySubscriber, () =>
        h.withPolicy(table, 'subscriber_self_read', anySubscriber, () => h.as(asSubscriber(USERS.moussa), read)),
      );
      expect(seen).toHaveLength(4);
    });

    it('payments.subscriber_self_read sans condition d’espace : Moussa voit ses paiements dans le contexte de B', async () => {
      const context = { space: 'association', associationId: B.id, userId: USERS.moussa } as const;
      const seen = await h.withPolicy(
        'payments',
        'subscriber_self_read',
        { using: 'user_id = app_user_id()', withCheck: null },
        () => h.as(context, paymentIds),
      );
      expect(seen).toContain(PAYMENTS.moussa);
    });

    it('allocations.subscriber_self_read sans condition d’espace : ses répartitions apparaissent dans B', async () => {
      const context = { space: 'association', associationId: B.id, userId: USERS.moussa } as const;
      const own = { using: 'user_id = app_user_id()', withCheck: null };
      const seen = await h.withPolicy('payments', 'subscriber_self_read', own, () =>
        h.withPolicy(
          'allocations',
          'subscriber_self_read',
          {
            using:
              'EXISTS (SELECT 1 FROM payments p WHERE p.id = allocations.payment_id AND p.user_id = app_user_id())',
            withCheck: null,
          },
          () => h.as(context, allocationIds),
        ),
      );
      expect(seen).toContain(ALLOCATIONS.moussa);
    });

    it.each([
      ['payments', paymentIds],
      ['allocations', allocationIds],
    ] as const)('%s.subscriber_self_read retirée : Moussa ne voit plus rien', async (table, read) => {
      expect(
        await h.withoutPolicy(table, 'subscriber_self_read', () => h.as(asSubscriber(USERS.moussa), read)),
      ).toEqual([]);
    });

    /** Conditions de payments.subscriber_declare (schema.sql) ; chacune, retirée seule, laisse passer sa déclaration. */
    const DECLARE_CONDITIONS = {
      user: 'user_id = app_user_id()',
      space: "app_space() = 'subscriber'",
      status: "status = 'pending'",
      version: 'version = 1',
      declaredAt: 'declared_at = now()',
      received: 'amount_received IS NULL',
      reviewedBy: 'reviewed_by IS NULL',
      reviewedAt: 'reviewed_at IS NULL',
      reason: 'rejection_reason_code IS NULL',
      message: 'rejection_message IS NULL',
    } as const;

    it.each([
      // Validé ou rejeté exigent un relecteur (payments_reviewed), déjà refusé : seul « annulé » isole la condition.
      ['status', { status: 'canceled' }],
      ['version', { version: 2 }],
      ['declaredAt', { declaredAt: '2020-01-01T00:00:00Z' }],
      ['received', { amountReceived: 1 }],
      ['reviewedBy', { reviewedBy: USERS.moussa }],
      ['reviewedAt', { reviewedAt: '2026-10-01T10:00:00Z' }],
      ['reason', { rejectionCode: 'other' }],
      ['message', { rejectionMessage: 'x' }],
    ] as const)(
      'payments.subscriber_declare sans la condition %s : la déclaration interdite passe',
      async (name, change) => {
        const withCheck = Object.entries(DECLARE_CONDITIONS)
          .filter(([key]) => key !== name)
          .map(([, condition]) => condition)
          .join(' AND ');
        const error = await h.withPolicy('payments', 'subscriber_declare', { using: null, withCheck }, () =>
          errorOf(
            h.asRollback(asSubscriber(USERS.moussa), (tx) => insertPayment(tx, { ...MOUSSA_DECLARATION, ...change })),
          ),
        );
        expect(error).toBeNull();
      },
    );

    it('payments.subscriber_declare retirée : Moussa ne déclare plus', async () => {
      const error = await h.withoutPolicy('payments', 'subscriber_declare', () =>
        errorOf(h.asRollback(asSubscriber(USERS.moussa), (tx) => insertPayment(tx, MOUSSA_DECLARATION))),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('allocations.subscriber_propose sans condition d’état : Moussa confirmerait lui-même', async () => {
      const error = await h.withPolicy(
        'allocations',
        'subscriber_propose',
        {
          using: null,
          withCheck:
            "app_space() = 'subscriber' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = allocations.payment_id AND p.user_id = app_user_id() AND p.status = 'pending')",
        },
        () =>
          errorOf(
            h.asRollback(asSubscriber(USERS.moussa), (tx) =>
              insertAllocation(tx, { ...MOUSSA_PROPOSAL, state: 'confirmed' }),
            ),
          ),
      );
      expect(error).toBeNull();
    });

    it('allocations.subscriber_propose sans condition de statut : Moussa propose sur son paiement validé', async () => {
      const error = await h.withPolicy(
        'allocations',
        'subscriber_propose',
        {
          using: null,
          withCheck:
            "app_space() = 'subscriber' AND state = 'proposed' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = allocations.payment_id AND p.user_id = app_user_id())",
        },
        () =>
          errorOf(
            h.asRollback(asSubscriber(USERS.moussa), (tx) =>
              insertAllocation(tx, { ...MOUSSA_PROPOSAL, payment: PAYMENTS.moussaValidated }),
            ),
          ),
      );
      expect(error).toBeNull();
    });

    it('allocations.subscriber_propose sans condition de personne : Moussa répartit le paiement d’Aminata', async () => {
      const anySubscriber = { using: "app_space() = 'subscriber'", withCheck: null };
      const error = await h.withPolicy('payments', 'subscriber_self_read', anySubscriber, () =>
        h.withPolicy(
          'allocations',
          'subscriber_propose',
          {
            using: null,
            withCheck:
              "app_space() = 'subscriber' AND state = 'proposed' AND EXISTS (SELECT 1 FROM payments p WHERE p.id = allocations.payment_id AND p.status = 'pending')",
          },
          () =>
            errorOf(
              h.asRollback(asSubscriber(USERS.moussa), (tx) =>
                insertAllocation(tx, {
                  ...MOUSSA_PROPOSAL,
                  payment: PAYMENTS.aminata,
                  installment: INSTALLMENTS.aminata2,
                  enrollment: ENROLLMENTS.aminata,
                }),
              ),
            ),
        ),
      );
      expect(error).toBeNull();
    });

    it('allocations.subscriber_propose retirée : Moussa ne propose plus', async () => {
      const error = await h.withoutPolicy('allocations', 'subscriber_propose', () =>
        errorOf(h.asRollback(asSubscriber(USERS.moussa), (tx) => insertAllocation(tx, MOUSSA_PROPOSAL))),
      );
      expect(isRlsViolation(error)).toBe(true);
    });
  });
});
