import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
 * Isolation des inscriptions et des échéances (lot 2.3, base migrée) : enrollments (tenant_isolation,
 * subscriber_self_read, subscriber_sign_update, system_access), installments (tenant_isolation, subscriber_self_read,
 * subscriber_pending_update, system_access), et les lectures souscripteur des projets reportées du lot 2.2
 * (projects et project_payment_methods.subscriber_enrolled_read). Chaque politique est aussi testée affaiblie.
 */

const PROJECTS = {
  a: '00000000-0000-7000-8000-00000000c201',
  b: '00000000-0000-7000-8000-00000000c202',
  /** Second projet de A, auquel personne n'est inscrit. */
  a2: '00000000-0000-7000-8000-00000000c203',
} as const;

const METHODS = {
  orangeA: '00000000-0000-7000-8000-0000000aa201',
  bankB: '00000000-0000-7000-8000-0000000aa202',
} as const;

/** Inscriptions : Moussa et Aminata dans A ; Fatou et Awa (gestionnaire de A) dans B. */
const ENROLLMENTS = {
  moussa: '00000000-0000-7000-8000-00000000e201',
  aminata: '00000000-0000-7000-8000-00000000e202',
  fatou: '00000000-0000-7000-8000-00000000e203',
  awaInB: '00000000-0000-7000-8000-00000000e204',
} as const;

/** Une échéance par inscription (rang 1). */
const INSTALLMENTS = {
  moussa: '00000000-0000-7000-8000-00000000d201',
  aminata: '00000000-0000-7000-8000-00000000d202',
  fatou: '00000000-0000-7000-8000-00000000d203',
  awaInB: '00000000-0000-7000-8000-00000000d204',
} as const;

const ids = (table: 'enrollments' | 'installments') => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));
const enrollmentIds = ids('enrollments');
const installmentIds = ids('installments');

const projectIds = (tx: Tx) =>
  tx.execute<{ id: string }>(sql`SELECT id FROM projects ORDER BY id`).then((r) => r.rows.map((row) => row.id));

const linkedProjects = (tx: Tx) =>
  tx
    .execute<{ project_id: string }>(sql`SELECT project_id FROM project_payment_methods ORDER BY project_id`)
    .then((r) => r.rows.map((row) => row.project_id));

const insertEnrollment = (tx: Tx, row: { id: string; association: string; project: string; user: string }) =>
  tx.execute(sql`INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
                 VALUES (${row.id}, ${row.association}, ${row.project}, ${row.user}, 'active', '2026-03-01', now())`);

const insertInstallment = (
  tx: Tx,
  row: { id: string; association: string; project: string; enrollment: string; user: string; sequence?: number },
) =>
  tx.execute(sql`INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence,
                                           due_date, amount_due)
                 VALUES (${row.id}, ${row.association}, ${row.project}, ${row.enrollment}, ${row.user}, 'periodic',
                         ${row.sequence ?? 9}, '2026-11-05', 25000)`);

/** Écritures valides de B, absentes du jeu de données : celles qu'un gestionnaire de A tente dans B. */
const insertEnrollmentInB = (tx: Tx) =>
  insertEnrollment(tx, {
    id: '00000000-0000-7000-8000-00000000e2f1',
    association: B.id,
    project: PROJECTS.b,
    user: USERS.moussa,
  });
const insertInstallmentInB = (tx: Tx) =>
  insertInstallment(tx, {
    id: '00000000-0000-7000-8000-00000000d2f1',
    association: B.id,
    project: PROJECTS.b,
    enrollment: ENROLLMENTS.fatou,
    user: USERS.fatou,
  });

const PROJECT_INSERT = `INSERT INTO projects (id, association_id, name, description, status, installment_amount,
                                              frequency, due_day, schedule_type, start_date, end_date, created_by)
                        VALUES ($1, $2, $3, '', 'active', 25000, 'monthly', 5, 'fixed', '2026-03-01', '2027-08-31', $4)`;

describe('isolation : enrollments, installments et lectures souscripteur des projets (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a, A.id, 'Centre A', USERS.awa]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.b, B.id, 'Projet B', USERS.koffi]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a2, A.id, 'Autre projet A', USERS.awa]);
    await h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label) VALUES
         ($1, $3, 'mobile_money', 'Orange Money'), ($2, $4, 'bank_transfer', 'SGBCI')`,
      [METHODS.orangeA, METHODS.bankB, A.id, B.id],
    );
    await h.superuser(
      `INSERT INTO project_payment_methods (project_id, payment_method_id, association_id) VALUES
         ($1, $3, $5), ($2, $4, $6), ($7, $3, $5)`,
      [PROJECTS.a, PROJECTS.b, METHODS.orangeA, METHODS.bankB, A.id, B.id, PROJECTS.a2],
    );
    const enrollments = [
      [ENROLLMENTS.moussa, A.id, PROJECTS.a, USERS.moussa, INSTALLMENTS.moussa],
      [ENROLLMENTS.aminata, A.id, PROJECTS.a, USERS.aminata, INSTALLMENTS.aminata],
      [ENROLLMENTS.fatou, B.id, PROJECTS.b, USERS.fatou, INSTALLMENTS.fatou],
      [ENROLLMENTS.awaInB, B.id, PROJECTS.b, USERS.awa, INSTALLMENTS.awaInB],
    ] as const;
    for (const [enrollment, association, project, user, installment] of enrollments) {
      await h.superuser(
        `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
         VALUES ($1, $2, $3, $4, 'active', '2026-03-01', now())`,
        [enrollment, association, project, user],
      );
      await h.superuser(
        `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                   amount_due)
         VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
        [installment, association, project, enrollment, user],
      );
    }
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('espace association', () => {
    it('chaque gestionnaire ne voit que les inscriptions et les échéances de son association', async () => {
      await h.as(asManagerOf(A), async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([ENROLLMENTS.moussa, ENROLLMENTS.aminata]);
        expect(await installmentIds(tx)).toEqual([INSTALLMENTS.moussa, INSTALLMENTS.aminata]);
      });
      await h.as(asManagerOf(B), async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([ENROLLMENTS.fatou, ENROLLMENTS.awaInB]);
        expect(await installmentIds(tx)).toEqual([INSTALLMENTS.fatou, INSTALLMENTS.awaInB]);
      });
    });

    it('membre de A et de B, dans le contexte de A : ni son inscription dans B, ni ses échéances', async () => {
      await h.as({ space: 'association', associationId: A.id, userId: USERS.awa }, async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([ENROLLMENTS.moussa, ENROLLMENTS.aminata]);
        expect(await installmentIds(tx)).toEqual([INSTALLMENTS.moussa, INSTALLMENTS.aminata]);
        // subscriber_enrolled_read ne joue que dans l'espace subscriber : le projet de B où Awa est inscrite reste caché.
        expect(await projectIds(tx)).toEqual([PROJECTS.a, PROJECTS.a2]);
      });
    });

    it('un gestionnaire de A n’écrit ni inscription ni échéance dans B', async () => {
      for (const write of [insertEnrollmentInB, insertInstallmentInB]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), write));
        expect(isRlsViolation(error)).toBe(true);
      }
    });

    it('dans son propre contexte, un gestionnaire n’inscrit personne à un projet d’une autre association', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(B), (tx) =>
          insertEnrollment(tx, {
            id: '00000000-0000-7000-8000-00000000e2f2',
            association: B.id,
            project: PROJECTS.a,
            user: USERS.koffi,
          }),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('une échéance reprend l’association, le projet et la personne de son inscription', async () => {
      const base = { id: '00000000-0000-7000-8000-00000000d2f2', association: A.id, project: PROJECTS.a };
      for (const row of [
        // Inscription d'une autre association, rattachée à A.
        { ...base, enrollment: ENROLLMENTS.fatou, user: USERS.fatou },
        // Autre personne que celle de l'inscription : Aminata lirait l'échéance de Moussa.
        { ...base, enrollment: ENROLLMENTS.moussa, user: USERS.aminata },
        // Autre projet de la même association.
        { ...base, project: PROJECTS.a2, enrollment: ENROLLMENTS.moussa, user: USERS.moussa },
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insertInstallment(tx, row)));
        expect({ row, code: pgCode(error) }).toEqual({ row, code: '23503' });
      }
    });

    it('un gestionnaire de A ne déplace ni inscription ni échéance, vers B ou vers un autre de ses projets', async () => {
      for (const statement of [
        sql`UPDATE enrollments SET association_id = ${B.id} WHERE id = ${ENROLLMENTS.moussa}`,
        sql`UPDATE installments SET association_id = ${B.id} WHERE id = ${INSTALLMENTS.moussa}`,
        sql`UPDATE enrollments SET project_id = ${PROJECTS.a2} WHERE id = ${ENROLLMENTS.moussa}`,
        sql`UPDATE installments SET enrollment_id = ${ENROLLMENTS.aminata}, user_id = ${USERS.aminata}
              WHERE id = ${INSTALLMENTS.moussa}`,
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => tx.execute(statement)));
        expect(pgMessage(error)).toBe('forbidden_update');
      }
    });

    it('un gestionnaire de A ne modifie ni ne supprime rien de B', async () => {
      const results = await h.asRollback(asManagerOf(A), async (tx) => [
        (await tx.execute(sql`UPDATE enrollments SET withdraw_reason = 'piraté' WHERE id = ${ENROLLMENTS.fatou}`))
          .rowCount,
        (await tx.execute(sql`UPDATE installments SET amount_paid = 25000 WHERE id = ${INSTALLMENTS.fatou}`)).rowCount,
        (await tx.execute(sql`DELETE FROM enrollments WHERE id = ${ENROLLMENTS.fatou}`)).rowCount,
      ]);
      expect(results).toEqual([0, 0, 0]);
    });

    it('une échéance ne se supprime jamais, même par son association (donnée financière)', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`DELETE FROM installments WHERE id = ${INSTALLMENTS.moussa}`),
        ),
      );
      expect(pgCode(error)).toBe('42501');
    });
  });

  describe('espace subscriber', () => {
    it('Moussa ne voit que son inscription, ses échéances, le projet suivi et ses moyens de paiement', async () => {
      await h.as(asSubscriber(USERS.moussa), async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([ENROLLMENTS.moussa]);
        expect(await installmentIds(tx)).toEqual([INSTALLMENTS.moussa]);
        expect(await projectIds(tx)).toEqual([PROJECTS.a]);
        expect(await linkedProjects(tx)).toEqual([PROJECTS.a]);
      });
    });

    it('Awa, souscriptrice de B : son inscription et le projet de B, rien de l’association qu’elle gère', async () => {
      await h.as(asSubscriber(USERS.awa), async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([ENROLLMENTS.awaInB]);
        expect(await installmentIds(tx)).toEqual([INSTALLMENTS.awaInB]);
        expect(await projectIds(tx)).toEqual([PROJECTS.b]);
        expect(await linkedProjects(tx)).toEqual([PROJECTS.b]);
      });
    });

    it('sans inscription (Koffi) : aucun projet, aucune échéance', async () => {
      await h.as(asSubscriber(USERS.koffi), async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([]);
        expect(await installmentIds(tx)).toEqual([]);
        expect(await projectIds(tx)).toEqual([]);
        expect(await linkedProjects(tx)).toEqual([]);
      });
    });

    it('un souscripteur ne met à jour que ses propres lignes', async () => {
      const results = await h.asRollback(asSubscriber(USERS.moussa), async (tx) => [
        (await tx.execute(sql`UPDATE installments SET amount_pending = 1000 WHERE id = ${INSTALLMENTS.aminata}`))
          .rowCount,
        (await tx.execute(sql`UPDATE enrollments SET activated_at = now() WHERE id = ${ENROLLMENTS.aminata}`)).rowCount,
        (await tx.execute(sql`UPDATE installments SET amount_pending = 1000 WHERE id = ${INSTALLMENTS.moussa}`))
          .rowCount,
        (await tx.execute(sql`UPDATE enrollments SET activated_at = now() WHERE id = ${ENROLLMENTS.moussa}`)).rowCount,
      ]);
      expect(results).toEqual([0, 0, 1, 1]);
    });

    it('un souscripteur ne donne pas sa ligne à une autre personne', async () => {
      for (const write of [
        (tx: Tx) =>
          tx.execute(sql`UPDATE installments SET user_id = ${USERS.aminata} WHERE id = ${INSTALLMENTS.moussa}`),
        (tx: Tx) => tx.execute(sql`UPDATE enrollments SET user_id = ${USERS.aminata} WHERE id = ${ENROLLMENTS.moussa}`),
      ]) {
        const error = await errorOf(h.asRollback(asSubscriber(USERS.moussa), write));
        expect(pgMessage(error)).toBe('forbidden_update');
      }
    });

    it('un souscripteur ne crée ni inscription ni échéance', async () => {
      for (const write of [
        (tx: Tx) =>
          insertEnrollment(tx, {
            id: '00000000-0000-7000-8000-00000000e2f3',
            association: A.id,
            project: PROJECTS.a2,
            user: USERS.moussa,
          }),
        (tx: Tx) =>
          insertInstallment(tx, {
            id: '00000000-0000-7000-8000-00000000d2f3',
            association: A.id,
            project: PROJECTS.a,
            enrollment: ENROLLMENTS.moussa,
            user: USERS.moussa,
          }),
      ]) {
        const error = await errorOf(h.asRollback(asSubscriber(USERS.moussa), write));
        expect(isRlsViolation(error)).toBe(true);
      }
    });
  });

  describe('autres espaces', () => {
    it.each([
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['public', { space: 'public' }],
      ['auth', { space: 'auth', userId: USERS.moussa }],
      ['association sans association', { space: 'association', userId: USERS.moussa }],
      [
        'association où la personne n’est pas inscrite',
        { space: 'association', associationId: B.id, userId: USERS.moussa },
      ],
    ] as const)('espace %s : aucune inscription, aucune échéance de Moussa', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await enrollmentIds(tx)).not.toContain(ENROLLMENTS.moussa);
        expect(await installmentIds(tx)).not.toContain(INSTALLMENTS.moussa);
        expect(await projectIds(tx)).not.toContain(PROJECTS.a);
        expect(await linkedProjects(tx)).not.toContain(PROJECTS.a);
      });
    });

    it.each([
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['public', { space: 'public' }],
      ['auth', { space: 'auth', userId: USERS.moussa }],
      ['association sans association', { space: 'association', userId: USERS.moussa }],
    ] as const)('espace %s : rien du tout', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await enrollmentIds(tx)).toEqual([]);
        expect(await installmentIds(tx)).toEqual([]);
      });
    });

    it('sans contexte, ou sans aucune variable app.* : rien', async () => {
      for (const table of ['enrollments', 'installments']) {
        expect({ table, n: await h.count(null, table) }).toEqual({ table, n: 0 });
        expect({ table, n: await h.countWithoutTenantDatabase(table) }).toEqual({ table, n: 0 });
      }
    });

    it('espace system (worker : cycle roulant, retards) : toutes les inscriptions et échéances', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        const count = async (table: string) =>
          (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n;
        return { enrollments: await count('enrollments'), installments: await count('installments') };
      });
      expect(seen).toEqual({ enrollments: 4, installments: 4 });
    });
  });

  describe('déclencheurs : appartenance immuable, écritures du souscripteur limitées (enrollments_guard, installments_guard)', () => {
    /** Inscription de Moussa au second projet de A, en attente de signature et sans échéance (aucune clé ne la retient). */
    const PENDING = '00000000-0000-7000-8000-00000000e2f6';

    /**
     * Transaction annulée en cotiz_app, dans l'espace donné (comme TenantDatabase) ; l'inscription en attente est posée
     * d'abord en superutilisateur. `guards: false` : déclencheurs désactivés le temps de la transaction (preuve que
     * la RLS seule ne refuserait pas).
     */
    const run = (
      context: { space: 'subscriber' | 'association'; userId: string; associationId?: string },
      statement: string,
      options: { guards?: boolean } = {},
    ) =>
      h.superuserRollback(async (client) => {
        await client.query(
          `INSERT INTO enrollments (id, association_id, project_id, user_id, status, starts_from, joined_at)
           VALUES ($1, $2, $3, $4, 'pending_signature', '2026-04-01', now())`,
          [PENDING, A.id, PROJECTS.a2, USERS.moussa],
        );
        if (options.guards === false) {
          await client.query('ALTER TABLE enrollments DISABLE TRIGGER enrollments_guard');
          await client.query('ALTER TABLE installments DISABLE TRIGGER installments_guard');
        }
        await client.query(
          `SELECT set_config('role', 'cotiz_app', true), set_config('app.space', $1, true),
                  set_config('app.user_id', $2, true), set_config('app.association_id', $3, true)`,
          [context.space, context.userId, context.associationId ?? ''],
        );
        const result = await errorOf(client.query(statement));
        return result === null ? 'accepted' : pgMessage(result) === 'forbidden_update' ? 'guard' : result;
      });

    const moussa = { space: 'subscriber', userId: USERS.moussa } as const;
    const managerA = { space: 'association', userId: USERS.awa, associationId: A.id } as const;
    const moveToB = `UPDATE enrollments SET association_id = '${B.id}', project_id = '${PROJECTS.b}' WHERE id = '${PENDING}'`;

    it('Moussa ne déplace pas son inscription sans échéance vers le projet de B', async () => {
      expect(await run(moussa, moveToB)).toBe('guard');
    });

    it('sans le déclencheur, la RLS et les clés laisseraient passer ce déplacement (le test précédent échouerait)', async () => {
      expect(await run(moussa, moveToB, { guards: false })).toBe('accepted');
    });

    it('le souscripteur signe : pending_signature → active, avec activated_at', async () => {
      expect(
        await run(moussa, `UPDATE enrollments SET status = 'active', activated_at = now() WHERE id = '${PENDING}'`),
      ).toBe('accepted');
    });

    it.each([
      `UPDATE enrollments SET status = 'withdrawn' WHERE id = '${ENROLLMENTS.moussa}'`,
      `UPDATE enrollments SET status = 'completed' WHERE id = '${PENDING}'`,
      `UPDATE enrollments SET starts_from = '2026-01-01' WHERE id = '${ENROLLMENTS.moussa}'`,
      `UPDATE enrollments SET withdraw_reason = 'x' WHERE id = '${ENROLLMENTS.moussa}'`,
      `UPDATE installments SET amount_paid = 25000 WHERE id = '${INSTALLMENTS.moussa}'`,
      `UPDATE installments SET amount_due = 1 WHERE id = '${INSTALLMENTS.moussa}'`,
      `UPDATE installments SET due_date = '2030-01-05' WHERE id = '${INSTALLMENTS.moussa}'`,
      `UPDATE installments SET paid_at = now() WHERE id = '${INSTALLMENTS.moussa}'`,
      `UPDATE installments SET late_since = NULL, sequence = 2 WHERE id = '${INSTALLMENTS.moussa}'`,
    ])('espace subscriber, refusé : %s', async (statement) => {
      expect(await run(moussa, statement)).toBe('guard');
    });

    it('espace subscriber, accepté : la déclaration (amount_pending, status)', async () => {
      expect(
        await run(
          moussa,
          `UPDATE installments SET amount_pending = 25000, status = 'declared' WHERE id = '${INSTALLMENTS.moussa}'`,
        ),
      ).toBe('accepted');
    });

    it('espace association : montants, statuts et retrait restent modifiables', async () => {
      for (const statement of [
        `UPDATE installments SET amount_paid = 25000, status = 'paid', paid_at = now() WHERE id = '${INSTALLMENTS.moussa}'`,
        `UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now(), withdrawn_by = '${USERS.awa}'
           WHERE id = '${ENROLLMENTS.moussa}'`,
      ]) {
        expect({ statement, outcome: await run(managerA, statement) }).toEqual({ statement, outcome: 'accepted' });
      }
    });

    it('sans le déclencheur, le souscripteur écrirait le montant versé (le test « refusé » échouerait)', async () => {
      const paid = `UPDATE installments SET amount_paid = 25000 WHERE id = '${INSTALLMENTS.moussa}'`;
      expect(await run(moussa, paid, { guards: false })).toBe('accepted');
    });
  });

  describe('invariants', () => {
    it('une personne n’est inscrite qu’une fois à un projet', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO enrollments (id, association_id, project_id, user_id, starts_from, joined_at)
             VALUES ('00000000-0000-7000-8000-00000000e2f4', $1, $2, $3, '2026-04-01', now())`,
            [A.id, PROJECTS.a, USERS.moussa],
          ),
        ),
      );
      expect(pgCode(error)).toBe('23505');
    });

    it('une seule échéance par rang et par nature dans une inscription', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertInstallment(tx, {
            id: '00000000-0000-7000-8000-00000000d2f4',
            association: A.id,
            project: PROJECTS.a,
            enrollment: ENROLLMENTS.moussa,
            user: USERS.moussa,
            sequence: 1,
          }),
        ),
      );
      expect(pgCode(error)).toBe('23505');
    });

    it('fonds d’entrée au rang 0, cotisations à partir du rang 1', async () => {
      for (const [kind, sequence] of [
        ['periodic', 0],
        ['entry_fee', 1],
        ['periodic', -1],
      ] as const) {
        const error = await errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind,
                                                     sequence, due_date, amount_due)
                           VALUES ('00000000-0000-7000-8000-00000000d2f6', ${A.id}, ${PROJECTS.a},
                                   ${ENROLLMENTS.moussa}, ${USERS.moussa}, ${kind}, ${sequence}, '2026-11-05', 1)`),
          ),
        );
        expect({ kind, sequence, code: pgCode(error) }).toEqual({ kind, sequence, code: '23514' });
      }
    });

    it('montants : dû > 0, versé et en attente ≥ 0, jamais plus que le dû', async () => {
      for (const set of [
        'amount_due = 0',
        'amount_paid = -1',
        'amount_pending = -1',
        'amount_paid = 20000, amount_pending = 10000',
        'amount_paid = 25001',
      ]) {
        const error = await h.superuserRollback((client) =>
          errorOf(client.query(`UPDATE installments SET ${set} WHERE id = $1`, [INSTALLMENTS.moussa])),
        );
        expect({ set, code: pgCode(error) }).toEqual({ set, code: '23514' });
      }
    });

    it('valeurs par défaut : inscription en attente de signature, échéance à venir sans montant versé', async () => {
      const { rows } = await h.superuserRollback(async (client) => {
        await client.query(
          `INSERT INTO enrollments (id, association_id, project_id, user_id, starts_from, joined_at)
           VALUES ('00000000-0000-7000-8000-00000000e2f5', $1, $2, $3, '2026-04-01', now())`,
          [A.id, PROJECTS.a2, USERS.moussa],
        );
        await client.query(
          `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                     amount_due)
           VALUES ('00000000-0000-7000-8000-00000000d2f5', $1, $2, '00000000-0000-7000-8000-00000000e2f5', $3,
                   'entry_fee', 0, '2026-04-05', 5000)`,
          [A.id, PROJECTS.a2, USERS.moussa],
        );
        return client.query(
          `SELECT e.status AS enrollment, i.status AS installment, i.amount_paid, i.amount_pending
             FROM installments i JOIN enrollments e ON e.id = i.enrollment_id
            WHERE i.id = '00000000-0000-7000-8000-00000000d2f5'`,
        );
      });
      expect(rows).toEqual([
        { enrollment: 'pending_signature', installment: 'upcoming', amount_paid: '0', amount_pending: '0' },
      ]);
    });

    it('un profil souscripteur référence une personne existante', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(`INSERT INTO subscriber_profiles (user_id) VALUES ('00000000-0000-7000-8000-000000000999')`),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    it.each([
      ['enrollments', 'tenant_isolation', enrollmentIds, 4],
      ['installments', 'tenant_isolation', installmentIds, 4],
    ] as const)('%s.%s élargie : le gestionnaire de A voit B', async (table, policy, read, n) => {
      const seen = await h.withPolicy(table, policy, { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), read),
      );
      expect(seen).toHaveLength(n);
    });

    it.each([
      ['enrollments', 'tenant_isolation', enrollmentIds],
      ['installments', 'tenant_isolation', installmentIds],
    ] as const)('%s.%s retirée : le gestionnaire ne voit plus rien des siens', async (table, policy, read) => {
      expect(await h.withoutPolicy(table, policy, () => h.as(asManagerOf(A), read))).toEqual([]);
    });

    it.each([
      ['enrollments', 'subscriber_self_read', enrollmentIds],
      ['installments', 'subscriber_self_read', installmentIds],
    ] as const)('%s.%s sans condition de personne : Moussa voit les autres', async (table, policy, read) => {
      const seen = await h.withPolicy(table, policy, { using: "app_space() = 'subscriber'", withCheck: null }, () =>
        h.as(asSubscriber(USERS.moussa), read),
      );
      expect(seen).toHaveLength(4);
    });

    it.each([
      ['enrollments', 'subscriber_self_read', enrollmentIds, ENROLLMENTS.moussa],
      ['installments', 'subscriber_self_read', installmentIds, INSTALLMENTS.moussa],
    ] as const)(
      '%s.%s sans condition d’espace : la personne se voit hors de son espace',
      async (table, policy, read, own) => {
        const context = { space: 'association', associationId: B.id, userId: USERS.moussa } as const;
        const seen = await h.withPolicy(table, policy, { using: 'user_id = app_user_id()', withCheck: null }, () =>
          h.as(context, read),
        );
        expect(seen).toContain(own);
      },
    );

    it.each([
      ['enrollments', 'subscriber_self_read', enrollmentIds],
      ['installments', 'subscriber_self_read', installmentIds],
    ] as const)('%s.%s retirée : Moussa ne voit plus rien', async (table, policy, read) => {
      expect(await h.withoutPolicy(table, policy, () => h.as(asSubscriber(USERS.moussa), read))).toEqual([]);
    });

    it.each([
      ['projects', projectIds],
      ['project_payment_methods', linkedProjects],
    ] as const)('%s.subscriber_enrolled_read sans condition d’inscription : Moussa voit tout', async (table, read) => {
      const seen = await h.withPolicy(
        table,
        'subscriber_enrolled_read',
        { using: "app_space() = 'subscriber'", withCheck: null },
        () => h.as(asSubscriber(USERS.moussa), read),
      );
      expect(seen.length).toBeGreaterThan(1);
    });

    it.each([
      ['projects', projectIds],
      ['project_payment_methods', linkedProjects],
    ] as const)(
      '%s.subscriber_enrolled_read sans condition d’espace : le projet suivi apparaît dans B',
      async (table, read) => {
        const context = { space: 'association', associationId: B.id, userId: USERS.moussa } as const;
        const using = `EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = ${table}.project_id AND e.user_id = app_user_id())`;
        const seen = await h.withPolicy(
          table,
          'subscriber_enrolled_read',
          {
            using: table === 'projects' ? using.replace('projects.project_id', 'projects.id') : using,
            withCheck: null,
          },
          // Les inscriptions de Moussa ne sont visibles qu'en espace subscriber : on élargit aussi leur lecture.
          () =>
            h.withPolicy(
              'enrollments',
              'subscriber_self_read',
              { using: 'user_id = app_user_id()', withCheck: null },
              () => h.as(context, read),
            ),
        );
        expect(seen).toContain(PROJECTS.a);
      },
    );

    it.each([
      ['projects', projectIds],
      ['project_payment_methods', linkedProjects],
    ] as const)('%s.subscriber_enrolled_read retirée : Moussa ne voit plus son projet', async (table, read) => {
      expect(
        await h.withoutPolicy(table, 'subscriber_enrolled_read', () => h.as(asSubscriber(USERS.moussa), read)),
      ).toEqual([]);
    });

    it.each([
      [
        'enrollments',
        'subscriber_sign_update',
        sql`UPDATE enrollments SET activated_at = now() WHERE id = ${ENROLLMENTS.aminata}`,
      ],
      [
        'installments',
        'subscriber_pending_update',
        sql`UPDATE installments SET amount_pending = 1 WHERE id = ${INSTALLMENTS.aminata}`,
      ],
    ] as const)(
      '%s.%s sans condition de personne : Moussa modifie la ligne d’Aminata',
      async (table, policy, statement) => {
        // Un UPDATE ne touche que les lignes lisibles : la lecture est élargie aussi, sinon subscriber_self_read
        // suffirait à protéger la ligne d'Aminata.
        const anySubscriber = { using: "app_space() = 'subscriber'", withCheck: "app_space() = 'subscriber'" };
        const written = await h.withPolicy(table, 'subscriber_self_read', { ...anySubscriber, withCheck: null }, () =>
          h.withPolicy(table, policy, anySubscriber, () =>
            h.asRollback(asSubscriber(USERS.moussa), async (tx) => (await tx.execute(statement)).rowCount),
          ),
        );
        expect(written).toBe(1);
      },
    );

    it.each([
      [
        'enrollments',
        'subscriber_sign_update',
        sql`UPDATE enrollments SET user_id = ${USERS.aminata} WHERE id = ${ENROLLMENTS.moussa}`,
      ],
      [
        'installments',
        'subscriber_pending_update',
        sql`UPDATE installments SET user_id = ${USERS.aminata} WHERE id = ${INSTALLMENTS.moussa}`,
      ],
    ] as const)(
      '%s.%s en WITH CHECK (true) : le déclencheur refuse encore de donner sa ligne à Aminata',
      async (table, policy, statement) => {
        // La nouvelle ligne doit aussi rester lisible (subscriber_self_read), élargie de même : le refus ne vient plus de
        // la RLS mais du déclencheur d'appartenance (enrollments_guard, installments_guard), testé sans lui plus haut.
        const using = "user_id = app_user_id() AND app_space() = 'subscriber'";
        const error = await h.withPolicy(
          table,
          'subscriber_self_read',
          { using: "app_space() = 'subscriber'", withCheck: null },
          () =>
            h.withPolicy(table, policy, { using, withCheck: 'true' }, () =>
              errorOf(h.asRollback(asSubscriber(USERS.moussa), (tx) => tx.execute(statement))),
            ),
        );
        expect(isRlsViolation(error)).toBe(false);
        expect(pgMessage(error)).toBe('forbidden_update');
      },
    );

    const tenant = 'association_id = app_association_id()';
    const system = "app_space() = 'system'";

    it.each([
      ['enrollments', 'tenant_isolation', tenant, insertEnrollmentInB],
      ['installments', 'tenant_isolation', tenant, insertInstallmentInB],
      ['enrollments', 'system_access', system, insertEnrollmentInB],
      ['installments', 'system_access', system, insertInstallmentInB],
    ] as const)(
      '%s.%s en WITH CHECK (true) : le gestionnaire de A écrit dans B, que les tests d’écriture refusent',
      async (table, policy, using, write) => {
        const written = await h.withPolicy(table, policy, { using, withCheck: 'true' }, () =>
          h.asRollback(asManagerOf(A), async (tx) => (await write(tx)).rowCount),
        );
        expect(written).toBe(1);
      },
    );

    it.each([
      ['enrollments', enrollmentIds],
      ['installments', installmentIds],
    ] as const)('%s.system_access élargie hors espace system : un souscripteur verrait tout', async (table, read) => {
      const seen = await h.withPolicy(table, 'system_access', { using: 'true', withCheck: 'true' }, () =>
        h.as(asSubscriber(USERS.moussa), read),
      );
      expect(seen).toHaveLength(4);
    });
  });
});
