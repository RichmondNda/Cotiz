import { ENDPOINTS } from '@cotiz/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Lot 2.4 · étape 7 : rejet motivé (lg.pay.reject) et annulation d'une validation par son auteur dans les 10 minutes
 * (lg.pay.revert, opération compensatoire, architecture/04 § 4.5). Vérification de l'étape : une annulation restitue
 * exactement l'état antérieur (comparaison avant/après).
 *
 * Horloge réelle, comme ledger-validate.test.ts. PROJECTS.a : 25 000 F le 5 de chaque mois depuis le 2026-03-05, délai
 * de grâce 5 jours : juin à septembre sont en retard.
 */

const Detail = ENDPOINTS['lg.pay.get'].operations.get.response.body;

describe('rejet et annulation d’un paiement (lg.pay.reject, lg.pay.revert)', () => {
  let f: LedgerFixture;

  const post = (
    path: string,
    options: { body?: unknown; version?: number | null; token?: string; aid?: string; key?: string } = {},
  ) =>
    f.call(`/associations/${options.aid ?? A.id}/payments/${path}`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body: options.body ?? {},
      headers: {
        'idempotency-key': options.key ?? crypto.randomUUID(),
        ...(options.version === null || options.version === undefined
          ? {}
          : { 'if-match': `W/"${String(options.version)}"` }),
      },
    });
  const validate = (payId: string, options: Parameters<typeof post>[1] = {}) =>
    post(`${payId}/validate`, { version: 1, ...options });
  const reject = (payId: string, options: Parameters<typeof post>[1] = {}) =>
    post(`${payId}/reject`, { version: 1, body: { reasonCode: 'not_received', message: 'Rien reçu' }, ...options });
  const revert = (payId: string, options: Parameters<typeof post>[1] = {}) =>
    post(`${payId}/revert-validation`, options);
  const ok = async (res: Response) => {
    expect(res.status).toBe(200);
    return Detail.parse(await res.json());
  };
  const problem = async (res: Response) => (await res.json()) as Record<string, unknown>;
  const allocate = (...lines: [string, number][]) => ({
    allocations: lines.map(([installmentId, amount]) => ({ installmentId, amount: xof(amount) })),
  });

  const balances = async (ids: string[]) =>
    (
      await f.h.superuser(
        `SELECT id, amount_paid::text, amount_pending::text, status, late_since::text, paid_at FROM installments
          WHERE id = ANY($1::uuid[]) ORDER BY due_date, id`,
        [ids],
      )
    ).rows as {
      id: string;
      amount_paid: string;
      amount_pending: string;
      status: string;
      late_since: string | null;
      paid_at: Date | null;
    }[];
  /** Échéances dont le solde stocké ne correspond pas aux répartitions vivantes. */
  const drift = async () =>
    (
      await f.h.superuser(
        `SELECT i.id FROM installments i
           CROSS JOIN LATERAL (
             SELECT coalesce(sum(a.amount) FILTER (WHERE a.state = 'confirmed' AND p.status = 'validated'), 0) AS paid,
                    coalesce(sum(a.amount) FILTER (WHERE a.state = 'proposed' AND p.status = 'pending'), 0) AS pending
               FROM allocations a JOIN payments p ON p.id = a.payment_id
              WHERE a.installment_id = i.id) x
          WHERE i.amount_paid <> x.paid OR i.amount_pending <> x.pending`,
      )
    ).rows as unknown[];
  /** Ce qui décrit un paiement pour le métier (sans version : chaque écriture l'incrémente). */
  const paymentRow = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT status, amount_received::text, reviewed_by, reviewed_at, rejection_reason_code, rejection_message
           FROM payments WHERE id = $1`,
        [id],
      )
    ).rows[0] as Record<string, unknown>;
  /** Répartitions vivantes (proposées ou confirmées) d'un paiement, dans l'ordre de l'échéancier. */
  const liveAllocations = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT a.installment_id, a.amount::text, a.state FROM allocations a
           JOIN installments i ON i.id = a.installment_id
          WHERE a.payment_id = $1 AND a.state <> 'voided' ORDER BY i.due_date, a.state`,
        [id],
      )
    ).rows as { installment_id: string; amount: string; state: string }[];
  const lockedAt = async () =>
    (
      (await f.h.superuser('SELECT financial_terms_locked_at FROM projects WHERE id = $1', [PROJECTS.a])).rows[0] as {
        financial_terms_locked_at: Date | null;
      }
    ).financial_terms_locked_at;
  /** État métier observable : paiements, répartitions vivantes, échéances, conditions du projet. */
  const snapshot = async (s: Scenario) => ({
    payments: await Promise.all(s.payments.map(paymentRow)),
    allocations: await Promise.all(s.payments.map(liveAllocations)),
    balances: await balances(s.watched),
    locked: await lockedAt(),
  });
  const events = async (type: string, paymentId: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = $1 AND payload->>'paymentId' = $2`,
        [type, paymentId],
      )
    ).rows as { association_id: string; actor_user_id: string; payload: Record<string, unknown> }[];
  const audits = async (action: string, paymentId: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, before, after FROM audit_logs WHERE action = $1 AND entity_id = $2`,
        [action, paymentId],
      )
    ).rows as { actor_user_id: string; association_id: string; before: unknown; after: unknown }[];
  const nameOf = async (userId: string) => {
    const [user] = (await f.h.superuser('SELECT first_name, last_name FROM users WHERE id = $1', [userId])).rows as {
      first_name: string;
      last_name: string;
    }[];
    return `${user?.first_name ?? ''} ${user?.last_name ?? ''}`;
  };

  /** Attend `n` transactions de l'api bloquées par un verrou (lu hors transaction, voir ledger-validate.test.ts). */
  const blocked = async (n: number) => {
    for (let i = 0; i < 400; i += 1) {
      const { rowCount } = await f.h.superuser(
        `SELECT 1 FROM pg_stat_activity
          WHERE usename = 'cotiz_app' AND datname = current_database() AND cardinality(pg_blocking_pids(pid)) > 0`,
      );
      if ((rowCount ?? 0) >= n) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`${String(n)} transaction(s) de l’api jamais bloquée(s) par un verrou`);
  };
  /** Deux requêtes lancées pendant qu'une autre transaction tient `lock`, relâché quand les deux attendent. */
  const whileLocked = async (
    lock: string,
    values: unknown[],
    run: () => [Promise<Response>, Promise<Response>],
  ): Promise<[Response, Response]> => {
    const holder = new pg.Client({ connectionString: f.h.db.superuserUrl });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(lock, values);
      const pending = run();
      await blocked(2);
      await holder.query('COMMIT');
      return [await pending[0], await pending[1]];
    } finally {
      await holder.end();
    }
  };

  /**
   * Kofi (entré au début du projet) : `main` = 50 000 F déclarés sur juin et juillet, `other` = 15 000 F sur septembre
   * (en attente). Avec `history` : mars validé le 2026-03-05, conditions du projet verrouillées ce jour-là. Dans B : un
   * paiement en attente de Fatou.
   */
  const scenario = async (options: { history?: boolean } = {}) => {
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const kofiUser = await f.userOf(kofi.id);
    const inst = {
      march: await f.installmentOf(kofi.id, '2026-03-05'),
      june: await f.installmentOf(kofi.id, '2026-06-05'),
      july: await f.installmentOf(kofi.id, '2026-07-05'),
      august: await f.installmentOf(kofi.id, '2026-08-05'),
      september: await f.installmentOf(kofi.id, '2026-09-05'),
    };
    const payments: string[] = [];
    if (options.history) {
      payments.push(
        await f.record({
          enrollmentId: kofi.id,
          userId: kofiUser,
          amount: 25000,
          status: 'validated',
          declaredAt: '2026-03-05T08:00:00Z',
          reviewedBy: USERS.awa,
          reviewedAt: '2026-03-05T15:00:00Z',
          lines: [{ installmentId: inst.march, amount: 25000, state: 'confirmed' }],
        }),
      );
      await f.h.superuser(`UPDATE projects SET financial_terms_locked_at = '2026-03-05T15:00:00Z' WHERE id = $1`, [
        PROJECTS.a,
      ]);
    }
    const main = await f.record({
      enrollmentId: kofi.id,
      userId: kofiUser,
      amount: 50000,
      status: 'pending',
      declaredAt: '2026-10-20T18:00:00Z',
      lines: [
        { installmentId: inst.june, amount: 25000, state: 'proposed' },
        { installmentId: inst.july, amount: 25000, state: 'proposed' },
      ],
    });
    const other = await f.record({
      enrollmentId: kofi.id,
      userId: kofiUser,
      amount: 15000,
      status: 'pending',
      declaredAt: '2026-10-21T19:00:00Z',
      lines: [{ installmentId: inst.september, amount: 15000, state: 'proposed' }],
    });
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    const marchB = await f.installmentOf(fatou.id, '2026-03-05');
    const ofB = await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: fatou.id,
      userId: USERS.fatou,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-10-19T08:00:00Z',
      lines: [{ installmentId: marchB, amount: 25000, state: 'proposed' }],
    });
    payments.push(main, other, ofB);
    const watched = [...Object.values(inst), marchB];
    return { kofi, kofiUser, inst, main, other, ofB, marchB, payments, watched };
  };
  type Scenario = Awaited<ReturnType<typeof scenario>>;

  beforeAll(async () => {
    f = await startLedgerFixture();
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type LIKE 'payment.%'`);
    await f.h.superuser('UPDATE projects SET financial_terms_locked_at = NULL WHERE id = $1', [PROJECTS.a]);
  });

  describe('rejet (lg.pay.reject)', () => {
    it('motif enregistré, proposition annulée, déclaré libéré, retard rétabli, audit, payment.rejected', async () => {
      const s = await scenario();
      const res = await reject(s.main, { body: { reasonCode: 'amount_mismatch', message: 'Montant différent' } });
      expect(res.headers.get('etag')).toBe('W/"2"');
      const body = await ok(res);
      expect(body).toMatchObject({
        id: s.main,
        status: 'rejected',
        rejection: { reasonCode: 'amount_mismatch', message: 'Montant différent' },
        reviewedBy: { id: USERS.awa },
        revertibleUntil: null,
        version: 2,
      });
      // Échéances couvertes : celles de la déclaration, annulées.
      expect(body.covered.map((c) => [c.installmentId, c.state])).toEqual([
        [s.inst.june, 'voided'],
        [s.inst.july, 'voided'],
      ]);
      expect(await liveAllocations(s.main)).toEqual([]);
      const [june, july, september] = await balances([s.inst.june, s.inst.july, s.inst.september]);
      for (const [b, since] of [
        [june, '2026-06-11'],
        [july, '2026-07-11'],
      ] as const) {
        expect(b).toMatchObject({ amount_paid: '0', amount_pending: '0', status: 'late', late_since: since });
      }
      // Le déclaré d'un autre paiement reste en attente.
      expect(september).toMatchObject({ amount_pending: '15000', status: 'declared' });
      expect(await paymentRow(s.main)).toMatchObject({
        status: 'rejected',
        reviewed_by: USERS.awa,
        rejection_reason_code: 'amount_mismatch',
        rejection_message: 'Montant différent',
        amount_received: null,
      });
      expect(await events('payment.rejected', s.main)).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          payload: { paymentId: s.main, userId: s.kofiUser, reasonCode: 'amount_mismatch' },
        },
      ]);
      const [audit] = await audits('payment.reject', s.main);
      expect(audit).toMatchObject({
        actor_user_id: USERS.awa,
        association_id: A.id,
        before: { status: 'pending', version: 1 },
        after: { status: 'rejected', version: 2, reasonCode: 'amount_mismatch' },
      });
      expect(await drift()).toEqual([]);
    });

    it('sans message : motif seul ; motif hors liste ou absent → 422 validation_failed, rien d’écrit', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      for (const body of [{}, { reasonCode: 'autre' }, { reasonCode: 'other', message: 'x'.repeat(1001) }]) {
        const res = await reject(s.main, { body });
        expect(res.status).toBe(422);
        expect((await problem(res)).code).toBe('validation_failed');
      }
      expect(await snapshot(s)).toEqual(before);
      const body = await ok(await reject(s.main, { body: { reasonCode: 'unreadable_proof' } }));
      expect(body.rejection).toEqual({ reasonCode: 'unreadable_proof', message: null });
    });

    it('déjà validé ou rejeté → 409 payment_already_reviewed (nom, statut), prioritaire sur 412 ; If-Match périmé → 412', async () => {
      const s = await scenario();
      const stale = await reject(s.main, { version: 7 });
      expect(stale.status).toBe(412);
      expect((await problem(stale)).code).toBe('version_conflict');
      await ok(await validate(s.main));
      const afterValidation = await snapshot(s);
      const res = await reject(s.main, { version: 1 });
      expect(res.status).toBe(409);
      expect(await problem(res)).toMatchObject({
        code: 'payment_already_reviewed',
        reviewerName: await nameOf(USERS.awa),
        paymentStatus: 'validated',
      });
      expect(await snapshot(s)).toEqual(afterValidation);
      await ok(await reject(s.other));
      const again = await reject(s.other, { version: 2 });
      expect(again.status).toBe(409);
      expect(await problem(again)).toMatchObject({ code: 'payment_already_reviewed', paymentStatus: 'rejected' });
      expect(await audits('payment.reject', s.main)).toEqual([]);
      expect(await audits('payment.reject', s.other)).toHaveLength(1);
    });

    it('même Idempotency-Key : même réponse, un seul rejet, un seul événement', async () => {
      const s = await scenario();
      const key = crypto.randomUUID();
      const first = await ok(await reject(s.main, { key }));
      const replay = await ok(await reject(s.main, { key }));
      expect(replay).toEqual(first);
      expect(await events('payment.rejected', s.main)).toHaveLength(1);
    });

    it('rejet et validation du même paiement en même temps : un seul aboutit, l’autre 409', async () => {
      const s = await scenario();
      const [rejected, validated] = await whileLocked(
        'SELECT 1 FROM payments WHERE id = $1 FOR UPDATE',
        [s.main],
        () => [reject(s.main), validate(s.main)],
      );
      expect([rejected.status, validated.status].sort()).toEqual([200, 409]);
      expect(await drift()).toEqual([]);
    });
  });

  describe('annulation d’une validation (lg.pay.revert)', () => {
    it('répartition ajustée et montant reçu différent : l’annulation restitue exactement l’état antérieur', async () => {
      const s = await scenario({ history: true });
      const before = await snapshot(s);
      const validated = await ok(
        await validate(s.main, {
          body: {
            amountReceived: xof(60000),
            ...allocate([s.inst.june, 25000], [s.inst.july, 25000], [s.inst.august, 10000]),
          },
        }),
      );
      expect(validated.revertibleUntil).not.toBeNull();
      expect(await snapshot(s)).not.toEqual(before);
      const res = await revert(s.main);
      expect(res.headers.get('etag')).toBe('W/"3"');
      const body = await ok(res);
      expect(body).toMatchObject({
        id: s.main,
        status: 'pending',
        amountReceived: null,
        reviewedBy: null,
        reviewedAt: null,
        revertibleUntil: null,
        allocationAdjusted: false,
        version: 3,
      });
      expect(body.covered.map((c) => [c.installmentId, c.amount.amount, c.state])).toEqual([
        [s.inst.june, 25000, 'proposed'],
        [s.inst.july, 25000, 'proposed'],
      ]);
      expect(await snapshot(s)).toEqual(before);
      expect(await drift()).toEqual([]);
    });

    it('répartition du souscripteur : état antérieur, conditions déverrouillées (posées par cette validation), audit, événement', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      expect(before.locked).toBeNull();
      await ok(await validate(s.main));
      expect(await lockedAt()).not.toBeNull();
      await ok(await revert(s.main));
      expect(await snapshot(s)).toEqual(before);
      expect(await events('payment.reverted', s.main)).toEqual([
        { association_id: A.id, actor_user_id: USERS.awa, payload: { paymentId: s.main, revertedBy: USERS.awa } },
      ]);
      const [audit] = await audits('payment.reverted', s.main);
      expect(audit).toMatchObject({
        actor_user_id: USERS.awa,
        association_id: A.id,
        before: { status: 'validated', version: 2 },
        after: { status: 'pending', version: 3 },
      });
      // Le paiement se valide de nouveau, comme s'il n'avait jamais été traité.
      await ok(await validate(s.main, { version: 3 }));
      expect(await drift()).toEqual([]);
    });

    it('conditions figées par cette validation mais un autre paiement validé depuis : restent verrouillées', async () => {
      const s = await scenario();
      await ok(await validate(s.main));
      const locked = await lockedAt();
      expect(locked).not.toBeNull();
      await ok(await validate(s.other));
      await ok(await revert(s.main));
      expect(await lockedAt()).toEqual(locked);
    });

    it('conditions figées par une validation antérieure : restent verrouillées', async () => {
      const s = await scenario({ history: true });
      await ok(await validate(s.main));
      await ok(await revert(s.main));
      expect(await lockedAt()).toEqual(new Date('2026-03-05T15:00:00Z'));
    });

    it('conditions figées avant, sans aucun paiement validé : restent verrouillées (pas posées par cette validation)', async () => {
      const s = await scenario();
      await f.h.superuser(`UPDATE projects SET financial_terms_locked_at = '2026-10-01T09:00:00Z' WHERE id = $1`, [
        PROJECTS.a,
      ]);
      await ok(await validate(s.main));
      await ok(await revert(s.main));
      expect(await lockedAt()).toEqual(new Date('2026-10-01T09:00:00Z'));
    });

    it('paiement en attente ou rejeté → 409 invalid_state ; autre gestionnaire → 403 not_reviewer ; après 10 min → 409', async () => {
      const s = await scenario();
      const expectProblem = async (res: Response, status: number, code: string) => {
        expect(res.status).toBe(status);
        expect((await problem(res)).code).toBe(code);
      };
      await expectProblem(await revert(s.main), 409, 'invalid_state');
      await ok(await reject(s.other));
      await expectProblem(await revert(s.other), 409, 'invalid_state');
      await ok(await validate(s.main));
      // Validé par un autre gestionnaire (même association).
      await f.h.superuser('UPDATE payments SET reviewed_by = $2 WHERE id = $1', [s.main, USERS.koffi]);
      let before = await snapshot(s);
      await expectProblem(await revert(s.main), 403, 'not_reviewer');
      expect(await snapshot(s)).toEqual(before);
      // Par Awa, il y a un peu plus de 10 minutes.
      await f.h.superuser(
        `UPDATE payments SET reviewed_by = $2, reviewed_at = now() - interval '10 minutes 5 seconds' WHERE id = $1`,
        [s.main, USERS.awa],
      );
      before = await snapshot(s);
      await expectProblem(await revert(s.main), 409, 'revert_window_expired');
      expect(await snapshot(s)).toEqual(before);
      expect(await audits('payment.reverted', s.main)).toEqual([]);
    });

    it('déclaration qui ne rentre plus (échéance redéclarée depuis) → 409 invalid_state, rien d’écrit', async () => {
      const s = await scenario();
      // Juillet laissé ouvert par l'ajustement, puis déclaré par un nouveau paiement.
      await ok(await validate(s.main, { body: allocate([s.inst.june, 25000], [s.inst.august, 25000]) }));
      const later = await f.record({
        enrollmentId: s.kofi.id,
        userId: s.kofiUser,
        amount: 25000,
        status: 'pending',
        declaredAt: '2026-10-25T08:00:00Z',
        lines: [{ installmentId: s.inst.july, amount: 25000, state: 'proposed' }],
      });
      const before = { ...(await snapshot(s)), later: await liveAllocations(later) };
      const res = await revert(s.main);
      expect(res.status).toBe(409);
      expect((await problem(res)).code).toBe('invalid_state');
      expect({ ...(await snapshot(s)), later: await liveAllocations(later) }).toEqual(before);
    });

    it('échéance de la déclaration dispensée depuis la validation → 409 invalid_state, rien d’écrit', async () => {
      const s = await scenario();
      await ok(await validate(s.main, { body: allocate([s.inst.june, 25000], [s.inst.august, 25000]) }));
      await f.h.superuser(`UPDATE installments SET status = 'waived', late_since = NULL WHERE id = $1`, [s.inst.july]);
      const before = await snapshot(s);
      const res = await revert(s.main);
      expect(res.status).toBe(409);
      expect((await problem(res)).code).toBe('invalid_state');
      expect(await snapshot(s)).toEqual(before);
    });

    it('même Idempotency-Key : même réponse, une seule annulation ; deux annulations simultanées : une seule aboutit', async () => {
      const s = await scenario();
      await ok(await validate(s.main));
      const key = crypto.randomUUID();
      const first = await ok(await revert(s.main, { key }));
      expect(await ok(await revert(s.main, { key }))).toEqual(first);
      expect(await events('payment.reverted', s.main)).toHaveLength(1);

      await ok(await validate(s.main, { version: 3 }));
      const [one, two] = await whileLocked('SELECT 1 FROM payments WHERE id = $1 FOR UPDATE', [s.main], () => [
        revert(s.main),
        revert(s.main),
      ]);
      expect([one.status, two.status].sort()).toEqual([200, 409]);
      expect(await drift()).toEqual([]);
    });
  });

  describe('annulation et validation concurrentes sur le projet', () => {
    it('annulation de main et validation de other en même temps : sérialisées par le projet, conditions figées à la fin', async () => {
      const s = await scenario();
      await ok(await validate(s.main));
      const [reverted, validated] = await whileLocked(
        'SELECT 1 FROM projects WHERE id = $1 FOR UPDATE',
        [PROJECTS.a],
        () => [revert(s.main), validate(s.other)],
      );
      expect([reverted.status, validated.status]).toEqual([200, 200]);
      // Quel que soit l'ordre : other est validé, donc les conditions restent (ou redeviennent) figées.
      expect(await lockedAt()).not.toBeNull();
      expect(await drift()).toEqual([]);
    });
  });

  describe('isolation', () => {
    it('paiement d’une autre association ou inconnu → même 404 ; viewer → 403 ; souscripteur → 404 ; rien d’écrit', async () => {
      const s = await scenario();
      await ok(await validate(s.main));
      const before = await snapshot(s);
      const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
      for (const call of [reject, revert]) {
        const [foreign, unknown] = [await call(s.ofB), await call(crypto.randomUUID())];
        expect([foreign.status, unknown.status]).toEqual([404, 404]);
        expect(strip(await problem(foreign))).toEqual(strip(await problem(unknown)));
        // Koffi : viewer de A, owner de B.
        expect((await call(s.other, { token: f.tokens.koffi })).status).toBe(403);
        expect((await call(s.main, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
        expect((await call(s.other, { token: f.tokens.moussa })).status).toBe(404);
      }
      expect(await snapshot(s)).toEqual(before);
      for (const id of [s.main, s.other, s.ofB]) {
        expect(await events('payment.rejected', id)).toEqual([]);
        expect(await events('payment.reverted', id)).toEqual([]);
        expect(await audits('payment.reject', id)).toEqual([]);
        expect(await audits('payment.reverted', id)).toEqual([]);
      }
    });
  });
});
