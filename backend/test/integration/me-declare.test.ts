import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ENDPOINTS, type EventEnvelope, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { attachProofToAssociation } from '../../src/modules/files/files.public.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { METHODS } from './projects.fixture.js';

/**
 * Lot 3.3 · étape 2 : me.declare (architecture/04 § 4.4). Horloge : 2026-11-08 10:00 UTC (Abidjan). Moussa inscrit
 * sur PROJECTS.a depuis mars : ses échéances ouvertes viennent de me.projects (ordre de la grille).
 * Vérification du lot : double envoi → un seul paiement ; deux déclarations simultanées sur la même échéance → la
 * seconde voit le reste réduit.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Declared = ENDPOINTS['me.declare'].operations.declare.response.body;
const Projects = ENDPOINTS['me.projects'].operations.list.response.body;
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('me.declare', () => {
  let f: LedgerFixture;
  let enrollmentId: string;
  let open: string[];

  const declare = (body: Record<string, unknown>, options: { key?: string; token?: string } = {}) =>
    f.call('/me/payments', {
      token: options.token ?? f.tokens.moussa,
      method: 'POST',
      body,
      headers: { 'idempotency-key': options.key ?? crypto.randomUUID() },
    });
  /** 75 000 F sur les trois plus anciennes échéances ouvertes, avec une référence de transaction. */
  const body = (over: Record<string, unknown> = {}) => ({
    projectId: PROJECTS.a,
    amount: XOF(75000),
    paidOn: '2026-11-07',
    paymentMethodId: METHODS.orangeA,
    transactionReference: 'OM-2611-4471',
    allocations: open.slice(0, 3).map((installmentId) => ({ installmentId, amount: XOF(25000) })),
    ...over,
  });
  const nth = (i: number) => {
    const id = open[i];
    if (!id) throw new Error(`échéance ouverte n° ${String(i)} absente`);
    return id;
  };
  const problemOf = async (res: Response, status: number) => {
    expect(res.status).toBe(status);
    return Problem.parse(await res.json());
  };
  const count = async (sql: string, values: unknown[] = []) =>
    ((await f.h.superuser(sql, values)).rows[0] as { n: number }).n;
  const installment = async (id: string) =>
    (
      await f.h.superuser(
        'SELECT amount_pending::int AS pending, amount_paid::int AS paid, status FROM installments WHERE id = $1',
        [id],
      )
    ).rows[0] as { pending: number; paid: number; status: string };
  /** Preuve déposée par `owner` (espace souscripteur : sans association), dans l'état d'analyse donné. */
  const proof = async (
    owner: string,
    scan: 'pending' | 'clean' | 'infected' = 'clean',
    associationId: string | null = null,
  ) => {
    const id = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, sha256, scan_status)
       VALUES ($1, $2, $3, 'payment_proof', 'cotiz-proofs', $4, 'recu-orange.jpg', 'image/jpeg', 1024,
               CASE WHEN $5 = 'pending' THEN NULL ELSE 'abc' END, $5::files_scan_status)`,
      [id, associationId, owner, `unassigned/payment_proof/${id}.jpg`, scan],
    );
    return id;
  };
  /** Moussa inscrit sur PROJECTS.a depuis mars, ses échéances ouvertes lues par me.projects. */
  const enrollMoussa = async () => {
    enrollmentId = (await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' })).id;
    const res = await f.call('/me/projects', { token: f.tokens.moussa });
    const card = Projects.parse(await res.json()).items.find((c) => c.enrollmentId === enrollmentId);
    open = card?.openInstallments.map((i) => i.id) ?? [];
    expect(open.length).toBeGreaterThanOrEqual(4);
  };

  /** Vrai contexte worker (espace system permis, refusé à l'API) ; à fermer par l'appelant. */
  const startWorker = (): Promise<INestApplicationContext> =>
    NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: f.h.db.urlFor('cotiz_app'),
          REDIS_URL: f.redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
  /** Toutes les échéances de Moussa : jamais plus que le dû entre payé et en attente. */
  const overdrawn = async (): Promise<unknown[]> =>
    (
      await f.h.superuser(
        `SELECT id FROM installments WHERE enrollment_id = $1 AND amount_paid + amount_pending > amount_due`,
        [enrollmentId],
      )
    ).rows as { id: string }[];

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
  });
  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'payment.%'`);
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
    await enrollMoussa();
  });

  it('75 000 F sur trois échéances : paiement en attente, répartition proposée, échéances déclarées, événement, audit', async () => {
    const res = await declare(body());
    expect(res.status).toBe(201);
    const payment = Declared.parse(await res.json());
    expect(payment).toMatchObject({
      status: 'pending',
      amountDeclared: XOF(75000),
      amountReceived: null,
      paidOn: '2026-11-07',
      paymentMethodKind: 'mobile_money',
      project: { id: PROJECTS.a },
      association: { id: A.id },
      proof: { fileId: null, transactionReference: 'OM-2611-4471' },
      rejection: null,
      reviewedAt: null,
    });
    expect(payment.covered.map((c) => [c.installmentId, c.amount.amount, c.state])).toEqual(
      open.slice(0, 3).map((id) => [id, 25000, 'proposed']),
    );
    for (const id of open.slice(0, 3)) {
      expect(await installment(id)).toEqual({ pending: 25000, paid: 0, status: 'declared' });
    }
    expect((await installment(nth(3))).pending).toBe(0);

    const rows = (
      await f.h.superuser(
        'SELECT association_id, enrollment_id, user_id, status, version FROM payments WHERE id = $1',
        [payment.id],
      )
    ).rows as { association_id: string; enrollment_id: string; user_id: string; status: string; version: number }[];
    expect(rows).toEqual([
      { association_id: A.id, enrollment_id: enrollmentId, user_id: USERS.moussa, status: 'pending', version: 1 },
    ]);

    const events = (
      await f.h.superuser(`SELECT association_id, payload FROM outbox_events WHERE event_type = 'payment.declared'`)
    ).rows as { association_id: string; payload: Record<string, unknown> }[];
    expect(events).toEqual([
      {
        association_id: A.id,
        payload: { paymentId: payment.id, projectId: PROJECTS.a, userId: USERS.moussa, amount: 75000 },
      },
    ]);
    const audits = (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, entity_id, after FROM audit_logs WHERE action = 'payment.declare'`,
      )
    ).rows as { actor_user_id: string; association_id: string; entity_id: string; after: Record<string, unknown> }[];
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor_user_id: USERS.moussa, association_id: A.id, entity_id: payment.id });
    expect(audits[0]?.after).toMatchObject({ status: 'pending', amountDeclared: 75000 });
  });

  it('dernière échéance partielle : 60 000 F → 25 000, 25 000, 10 000', async () => {
    const res = await declare(
      body({
        amount: XOF(60000),
        allocations: [
          { installmentId: open[0], amount: XOF(25000) },
          { installmentId: open[1], amount: XOF(25000) },
          { installmentId: open[2], amount: XOF(10000) },
        ],
      }),
    );
    expect(res.status).toBe(201);
    expect(await installment(nth(2))).toEqual({ pending: 10000, paid: 0, status: 'declared' });
  });

  it('échéance passée en retard avant la tâche de 01:00 (late_since pas encore posé) : déclarée quand même', async () => {
    await f.h.superuser(`UPDATE installments SET status = 'late', late_since = NULL WHERE id = $1`, [nth(0)]);
    const res = await declare(
      body({ amount: XOF(25000), allocations: [{ installmentId: nth(0), amount: XOF(25000) }] }),
    );
    expect(res.status).toBe(201);
    const rows = (await f.h.superuser('SELECT status, late_since FROM installments WHERE id = $1', [nth(0)])).rows as {
      status: string;
      late_since: string | null;
    }[];
    // Seuls montant en attente et statut changent (trigger guard_installment_update en espace subscriber).
    expect(rows).toEqual([{ status: 'declared', late_since: null }]);
  });

  it('double envoi (même Idempotency-Key) : un seul paiement, même réponse, même après l’expiration de la réponse mémorisée', async () => {
    const key = crypto.randomUUID();
    const first = Declared.parse(await (await declare(body(), { key })).json());
    const again = await declare(body(), { key });
    expect(again.status).toBe(201);
    expect(Declared.parse(await again.json()).id).toBe(first.id);
    // Réponse mémorisée perdue (Redis vidé, au-delà de 24 h) : la contrainte (user_id, idempotency_key) rejoue.
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
    const late = await declare(body(), { key });
    expect(late.status).toBe(201);
    expect(Declared.parse(await late.json()).id).toBe(first.id);
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(1);
    expect(await count('SELECT count(*)::int AS n FROM allocations')).toBe(3);
    expect((await installment(nth(0))).pending).toBe(25000);
    expect(await count(`SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'payment.declared'`)).toBe(1);
    // Même clé, autre contenu, après expiration : refusé, rien n'est écrit.
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
    const other = await declare(
      body({ amount: XOF(25000), allocations: [{ installmentId: open[3], amount: XOF(25000) }] }),
      { key },
    );
    expect((await problemOf(other, 422)).code).toBe('idempotency_key_reused');
    // Même montant, autre répartition ou autre date : autre déclaration, refusée aussi.
    const reordered = body({
      allocations: [nth(0), nth(1), nth(3)].map((installmentId) => ({ installmentId, amount: XOF(25000) })),
    });
    for (const changed of [reordered, body({ paidOn: '2026-11-06' })]) {
      await f.redis.exec(['redis-cli', 'FLUSHALL']);
      expect((await problemOf(await declare(changed, { key }), 422)).code).toBe('idempotency_key_reused');
    }
    // Mêmes lignes dans un autre ordre, identifiants en majuscules : la même déclaration.
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
    const same = body({
      allocations: [nth(2), nth(0), nth(1)].map((id) => ({ installmentId: id.toUpperCase(), amount: XOF(25000) })),
    });
    const replayed = await declare(same, { key });
    expect(replayed.status).toBe(201);
    expect(Declared.parse(await replayed.json()).id).toBe(first.id);
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(1);
  });

  it('deux déclarations simultanées sur la même échéance : la seconde voit le reste réduit', async () => {
    const one = body({ amount: XOF(25000), allocations: [{ installmentId: open[0], amount: XOF(25000) }] });
    const results = await Promise.all([declare(one), declare(one)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    const refused = results.find((r) => r.status === 422);
    if (!refused) throw new Error('aucun refus');
    // Reste dû ramené à 0 par la première : l'échéance n'est plus ouverte (domain-rules § 3, § 5).
    expect(Problem.parse(await refused.json())).toMatchObject({
      code: 'validation_failed',
      fields: { [`allocations.${nth(0)}`]: 'installment_not_open' },
    });
    expect(await installment(nth(0))).toEqual({ pending: 25000, paid: 0, status: 'declared' });
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(1);
  });

  it('montant au-delà du reste dû → amount_exceeds_remaining (maxAmount) ; trop-perçu refusé (décision 6)', async () => {
    const remaining = await count(
      `SELECT sum(amount_due - amount_paid - amount_pending)::int AS n FROM installments
        WHERE enrollment_id = $1 AND status NOT IN ('paid', 'waived', 'canceled')`,
      [enrollmentId],
    );
    const res = await declare(body({ amount: XOF(remaining + 1000) }));
    expect(await problemOf(res, 422)).toMatchObject({ code: 'amount_exceeds_remaining', maxAmount: remaining });
  });

  it('répartition fausse : allocation_mismatch, allocation_exceeds_remaining, échéance d’autrui', async () => {
    const mismatch = await declare(body({ amount: XOF(50000) }));
    expect(await problemOf(mismatch, 422)).toMatchObject({
      code: 'allocation_mismatch',
      expected: 50000,
      allocated: 75000,
    });
    const exceeds = await declare(
      body({ amount: XOF(30000), allocations: [{ installmentId: open[0], amount: XOF(30000) }] }),
    );
    expect(await problemOf(exceeds, 422)).toMatchObject({
      code: 'allocation_exceeds_remaining',
      installmentId: open[0],
    });
    // Échéance d'un autre souscripteur (Fatou, même projet) : inconnue pour Moussa.
    const fatou = await f.enroll(PROJECTS.a, USERS.fatou, A.id);
    const theirs = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
      [theirs, A.id, PROJECTS.a, fatou, USERS.fatou],
    );
    const other = await declare(
      body({ amount: XOF(25000), allocations: [{ installmentId: theirs, amount: XOF(25000) }] }),
    );
    expect(await problemOf(other, 422)).toMatchObject({
      code: 'validation_failed',
      fields: { [`allocations.${theirs}`]: 'installment_not_open' },
    });
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(0);
    expect((await installment(theirs)).pending).toBe(0);
  });

  it('preuve : propre de la personne acceptée ; en analyse → 409 file_scan_pending ; infectée → file_not_clean ; autre → 422', async () => {
    const mine = await proof(USERS.moussa);
    const ok = await declare(body({ transactionReference: undefined, proofFileId: mine }));
    expect(ok.status).toBe(201);
    expect(Declared.parse(await ok.json()).proof).toEqual({
      fileId: mine,
      fileName: 'recu-orange.jpg',
      mimeType: 'image/jpeg',
      transactionReference: null,
    });
    await f.resetLedger();
    await enrollMoussa();

    const scanning = await proof(USERS.moussa, 'pending');
    expect((await problemOf(await declare(body({ proofFileId: scanning })), 409)).code).toBe('file_scan_pending');
    const infected = await proof(USERS.moussa, 'infected');
    expect((await problemOf(await declare(body({ proofFileId: infected })), 422)).code).toBe('file_not_clean');
    // D'autrui, inconnue, ou déjà rattachée à une autre association.
    for (const file of [await proof(USERS.fatou), crypto.randomUUID(), await proof(USERS.moussa, 'clean', B.id)]) {
      const refused = await problemOf(await declare(body({ proofFileId: file })), 422);
      expect(refused).toMatchObject({ code: 'validation_failed', fields: { proofFileId: 'not_found' } });
    }
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(0);
  });

  it('preuve déjà citée par un paiement en attente ou validé de l’association → 409 proof_already_used ; après un rejet ou une annulation : acceptée', async () => {
    const cases = [
      { status: 'pending', state: 'proposed', refused: true },
      { status: 'validated', state: 'confirmed', refused: true },
      { status: 'rejected', state: 'voided', refused: false },
      { status: 'canceled', state: 'voided', refused: false },
    ] as const;
    for (const c of cases) {
      const mine = await proof(USERS.moussa, 'clean', A.id);
      const earlier = await f.record({
        enrollmentId,
        userId: USERS.moussa,
        amount: 25000,
        status: c.status,
        declaredAt: '2026-11-06T09:00:00Z',
        proofFileId: mine,
        lines: [{ installmentId: nth(3), amount: 25000, state: c.state }],
        ...(c.status === 'validated'
          ? { amountReceived: 25000, reviewedBy: USERS.awa, reviewedAt: '2026-11-06T10:00:00Z' }
          : {}),
        ...(c.status === 'rejected'
          ? {
              reviewedBy: USERS.awa,
              reviewedAt: '2026-11-06T10:00:00Z',
              rejection: { code: 'not_received', message: null },
            }
          : {}),
      });
      const res = await declare(body({ transactionReference: undefined, proofFileId: mine }));
      if (c.refused) {
        expect((await problemOf(res, 409)).code).toBe('proof_already_used');
      } else {
        expect(res.status).toBe(201);
      }
      const citing = await count('SELECT count(*)::int AS n FROM payments WHERE proof_file_id = $1 AND id <> $2', [
        mine,
        earlier,
      ]);
      expect(citing).toBe(c.refused ? 0 : 1);
      await f.resetLedger();
      await enrollMoussa();
    }
  });

  it('même preuve citée en même temps deux fois dans la même association : une seule déclaration acceptée', async () => {
    for (let round = 0; round < 5; round++) {
      const mine = await proof(USERS.moussa);
      const one = (i: number) =>
        declare(
          body({
            transactionReference: undefined,
            proofFileId: mine,
            amount: XOF(25000),
            allocations: [{ installmentId: nth(i), amount: XOF(25000) }],
          }),
        );
      const responses = await Promise.all([one(0), one(1)]);
      expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
      const refused = responses.find((r) => r.status === 409);
      expect(refused && (await problemOf(refused, 409)).code).toBe('proof_already_used');
      expect(await count('SELECT count(*)::int AS n FROM payments WHERE proof_file_id = $1', [mine])).toBe(1);
      await f.resetLedger();
      await enrollMoussa();
    }
  });

  it('double envoi avec preuve, réponse mémorisée perdue : rejoué, pas proof_already_used', async () => {
    const key = crypto.randomUUID();
    const proofed = body({ transactionReference: undefined, proofFileId: await proof(USERS.moussa) });
    const first = Declared.parse(await (await declare(proofed, { key })).json());
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
    const late = await declare(proofed, { key });
    expect(late.status).toBe(201);
    expect(Declared.parse(await late.json()).id).toBe(first.id);
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(1);
  });

  it('ni preuve ni référence → proof_required', async () => {
    const res = await declare(body({ transactionReference: undefined }));
    expect((await problemOf(res, 422)).code).toBe('proof_required');
  });

  it('inscription en attente de signature → 403 signature_required ; terminée → 409 invalid_state', async () => {
    await f.h.superuser(`UPDATE enrollments SET status = 'pending_signature' WHERE id = $1`, [enrollmentId]);
    expect((await problemOf(await declare(body()), 403)).code).toBe('signature_required');
    await f.h.superuser(`UPDATE enrollments SET status = 'completed' WHERE id = $1`, [enrollmentId]);
    expect((await problemOf(await declare(body()), 409)).code).toBe('invalid_state');
    expect(await count('SELECT count(*)::int AS n FROM payments')).toBe(0);
  });

  it('devise, date future, moyen d’une autre association ou inactif → 422 validation_failed', async () => {
    const currency = await declare(body({ amount: { amount: 75000, currency: 'XAF' } }));
    expect(await problemOf(currency, 422)).toMatchObject({ fields: { amount: 'currency_mismatch' } });
    const future = await declare(body({ paidOn: '2026-11-09' }));
    expect(await problemOf(future, 422)).toMatchObject({ fields: { paidOn: 'in_future' } });
    for (const method of [METHODS.bankB, METHODS.waveInactiveA, crypto.randomUUID()]) {
      const res = await declare(body({ paymentMethodId: method }));
      expect(await problemOf(res, 422)).toMatchObject({ fields: { paymentMethodId: 'not_found' } });
    }
    expect((await declare(body({ paymentMethodId: null }))).status).toBe(201);
  });

  it('projet sans inscription de la personne → 404 ; jeton gestionnaire → 403', async () => {
    expect((await problemOf(await declare(body({ projectId: PROJECTS.b })), 404)).code).toBe('not_found');
    expect((await declare(body(), { token: f.tokens.awa })).status).toBe(403);
  });

  it('worker : la preuve est rattachée à l’association du paiement (rejeu sans effet)', async () => {
    const mine = await proof(USERS.moussa);
    const payment = Declared.parse(await (await declare(body({ proofFileId: mine }))).json());
    const worker = await startWorker();
    const proofConsumer = worker
      .get(EventConsumers)
      .for('payment.declared')
      .filter((c) => c.name === 'payment-proof');
    expect(proofConsumer).toHaveLength(1);
    const [event] = (await f.h.superuser(`SELECT payload FROM outbox_events WHERE event_type = 'payment.declared'`))
      .rows as { payload: Record<string, unknown> }[];
    const envelope: EventEnvelope = {
      id: '1',
      type: 'payment.declared',
      version: 1,
      occurredAt: NOW.toISOString(),
      associationId: A.id,
      actorUserId: USERS.moussa,
      aggregate: { type: 'payment', id: payment.id },
      payload: event?.payload ?? {},
    };
    try {
      for (let i = 0; i < 2; i++) for (const c of proofConsumer) await c.handle(envelope);
    } finally {
      await worker.close();
    }
    const files = (await f.h.superuser('SELECT association_id FROM files WHERE id = $1', [mine])).rows as {
      association_id: string;
    }[];
    expect(files).toEqual([{ association_id: A.id }]);
    // Le gestionnaire voit désormais la preuve (nom du fichier) dans le détail du paiement.
    const detail = await f.call(`/associations/${A.id}/payments/${payment.id}`, { token: f.tokens.awa });
    expect(((await detail.json()) as { proof: { fileName: string | null } }).proof.fileName).toBe('recu-orange.jpg');
  });
  it('preuve déjà citée par un paiement de la personne dans une autre association (pas encore rattachée) → 422', async () => {
    const mine = await proof(USERS.moussa);
    // Moussa inscrit aussi sur PROJECTS.b, paiement en attente qui cite la preuve (worker pas encore passé).
    const enrollmentB = await f.enroll(PROJECTS.b, USERS.moussa, B.id);
    const installmentB = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
      [installmentB, B.id, PROJECTS.b, enrollmentB, USERS.moussa],
    );
    await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: enrollmentB,
      userId: USERS.moussa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-07T09:00:00Z',
      proofFileId: mine,
      lines: [{ installmentId: installmentB, amount: 25000, state: 'proposed' }],
    });
    const refused = await problemOf(await declare(body({ proofFileId: mine })), 422);
    expect(refused).toMatchObject({ code: 'validation_failed', fields: { proofFileId: 'not_found' } });
    expect(await count('SELECT count(*)::int AS n FROM payments WHERE association_id = $1', [A.id])).toBe(0);
  });

  it('même preuve citée en même temps dans deux associations : une seule déclaration acceptée', async () => {
    // Moussa souscripteur de B aussi (retiré à la fin : les autres cas le veulent hors de B).
    const membershipB = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES ($1, $2, $3, 'subscriber', 'active', now())`,
      [membershipB, B.id, USERS.moussa],
    );
    onTestFinished(async () => {
      await f.h.superuser('DELETE FROM memberships WHERE id = $1', [membershipB]);
    });
    const enrollmentB = await f.enroll(PROJECTS.b, USERS.moussa, B.id);
    const installmentB = crypto.randomUUID();
    await f.h.superuser(
      `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                 amount_due)
       VALUES ($1, $2, $3, $4, $5, 'periodic', 1, '2026-03-05', 25000)`,
      [installmentB, B.id, PROJECTS.b, enrollmentB, USERS.moussa],
    );
    for (let round = 0; round < 5; round++) {
      const mine = await proof(USERS.moussa);
      const proofed = { transactionReference: undefined, proofFileId: mine };
      const [inA, inB] = await Promise.all([
        declare(
          body({ ...proofed, amount: XOF(25000), allocations: [{ installmentId: nth(round), amount: XOF(25000) }] }),
        ),
        declare(
          body({
            ...proofed,
            projectId: PROJECTS.b,
            amount: XOF(1000),
            paymentMethodId: METHODS.bankB,
            allocations: [{ installmentId: installmentB, amount: XOF(1000) }],
          }),
        ),
      ]);
      expect([inA.status, inB.status].sort()).toEqual([201, 422]);
      expect(await count('SELECT count(*)::int AS n FROM payments WHERE proof_file_id = $1', [mine])).toBe(1);
    }
  });

  it('déclaration et validation d’un autre paiement en même temps : aucun 500, aucun dépassement du dû', async () => {
    for (let round = 0; round < 3; round++) {
      await f.resetLedger();
      await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'payment.%'`);
      await enrollMoussa();
      const first = Declared.parse(
        await (
          await declare(body({ amount: XOF(25000), allocations: [{ installmentId: nth(0), amount: XOF(25000) }] }))
        ).json(),
      );
      const [validation, declaration] = await Promise.all([
        f.call(`/associations/${A.id}/payments/${first.id}/validate`, {
          token: f.tokens.awa,
          method: 'POST',
          body: {},
          headers: { 'idempotency-key': crypto.randomUUID(), 'if-match': 'W/"1"' },
        }),
        declare(
          body({
            amount: XOF(50000),
            allocations: [nth(0), nth(1)].map((id) => ({ installmentId: id, amount: XOF(25000) })),
          }),
        ),
      ]);
      expect(validation.status).toBe(200);
      // Le reste de la première échéance est pris (validée ou en attente) : la déclaration est refusée en 422.
      expect(declaration.status).toBe(422);
      expect(await installment(nth(0))).toEqual({ pending: 0, paid: 25000, status: 'paid' });
      expect(await overdrawn()).toEqual([]);
    }
  });

  it('déclaration et retrait de l’inscription en même temps : aucun 500 ni interblocage', async () => {
    for (let round = 0; round < 3; round++) {
      await f.resetLedger();
      await enrollMoussa();
      const [declaration, withdrawal] = await Promise.all([
        declare(body()),
        f.call(`/associations/${A.id}/enrollments/${enrollmentId}/withdraw`, {
          token: f.tokens.awa,
          method: 'POST',
          body: {},
        }),
      ]);
      expect(withdrawal.status).toBe(200);
      // Avant le retrait : déclarée ; après : inscription retirée (404 ou 409 selon le moment de la relecture).
      expect([201, 404, 409]).toContain(declaration.status);
      expect(await overdrawn()).toEqual([]);
    }
  });

  it('rattachement de la preuve : jamais celle d’un autre déposant ni une déjà rattachée ; événement d’une autre association sans effet', async () => {
    const worker = await startWorker();
    const attach = (fileId: string, ownerUserId: string, associationId: string) =>
      worker
        .get(TenantDatabase)
        .withTenantContext({ space: 'system' }, () => attachProofToAssociation({ fileId, ownerUserId, associationId }));
    const assoc = async (id: string) =>
      (
        (await f.h.superuser('SELECT association_id FROM files WHERE id = $1', [id])).rows[0] as {
          association_id: string | null;
        }
      ).association_id;
    try {
      const fatou = await proof(USERS.fatou);
      expect(await attach(fatou, USERS.moussa, A.id)).toBe(false);
      expect(await assoc(fatou)).toBeNull();
      const inB = await proof(USERS.moussa, 'clean', B.id);
      expect(await attach(inB, USERS.moussa, A.id)).toBe(false);
      expect(await assoc(inB)).toBe(B.id);
      // Événement porté par B pour un paiement de A : relu dans B, introuvable → rien n'est rattaché.
      const mine = await proof(USERS.moussa);
      const payment = Declared.parse(await (await declare(body({ proofFileId: mine }))).json());
      const [proofConsumer] = worker
        .get(EventConsumers)
        .for('payment.declared')
        .filter((c) => c.name === 'payment-proof');
      await proofConsumer?.handle({
        id: '2',
        type: 'payment.declared',
        version: 1,
        occurredAt: NOW.toISOString(),
        associationId: B.id,
        actorUserId: USERS.moussa,
        aggregate: { type: 'payment', id: payment.id },
        payload: { paymentId: payment.id, projectId: PROJECTS.a, userId: USERS.moussa, amount: 75000 },
      });
      expect(proofConsumer).toBeDefined();
      expect(await assoc(mine)).toBeNull();
    } finally {
      await worker.close();
    }
  });
});
