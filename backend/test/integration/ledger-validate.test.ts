import { ENDPOINTS } from '@cotiz/contracts';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Lot 2.4 · étapes 5 et 6 : validation d'un paiement (lg.pay.validate, architecture/04 § 4.5) : répartition du souscripteur
 * ou ajustée, montant reçu différent, contrôles de validateAllocation() (montant reçu ?? déclaré, en attente recalculé
 * hors ce paiement), verrous ordonnés (deux validations simultanées : une seule aboutit), If-Match, idempotence,
 * isolation.
 *
 * Horloge réelle : la base date ses écritures avec now(), l'api aussi ; les déclarations du jeu sont dans le passé
 * (octobre 2026). PROJECTS.a : 25 000 F le 5 de chaque mois, du 2026-03-05 au 2027-08-05 (18 échéances, 450 000 F),
 * délai de grâce 5 jours : juin à septembre sont en retard.
 */

const Detail = ENDPOINTS['lg.pay.validate'].operations.validate.response.body;

interface Balance {
  id: string;
  amount_paid: string;
  amount_pending: string;
  status: string;
  late_since: string | null;
  paid_at: Date | null;
}

describe('validation d’un paiement (lg.pay.validate)', () => {
  let f: LedgerFixture;

  const validate = (
    payId: string,
    options: { body?: unknown; version?: number | null; token?: string; aid?: string; key?: string } = {},
  ) =>
    f.call(`/associations/${options.aid ?? A.id}/payments/${payId}/validate`, {
      token: options.token ?? f.tokens.awa,
      method: 'POST',
      body: options.body ?? {},
      headers: {
        'idempotency-key': options.key ?? crypto.randomUUID(),
        ...(options.version === null ? {} : { 'if-match': `W/"${String(options.version ?? 1)}"` }),
      },
    });
  const validated = async (payId: string, options: Parameters<typeof validate>[1] = {}) => {
    const res = await validate(payId, options);
    expect(res.status).toBe(200);
    return { body: Detail.parse(await res.json()), etag: res.headers.get('etag') };
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
    ).rows as Balance[];
  const balance = async (id: string) => (await balances([id]))[0];

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
  const paymentRow = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT status, version, amount_received::text, reviewed_by, reviewed_at FROM payments WHERE id = $1`,
        [id],
      )
    ).rows[0] as {
      status: string;
      version: number;
      amount_received: string | null;
      reviewed_by: string | null;
      reviewed_at: Date | null;
    };
  /** Répartitions d'un paiement : annulées puis vivantes, chacune dans l'ordre de l'échéancier. */
  const allocationsOf = async (id: string) =>
    (
      await f.h.superuser(
        `SELECT a.installment_id, a.amount::text, a.state FROM allocations a
           JOIN installments i ON i.id = a.installment_id
          WHERE a.payment_id = $1 ORDER BY a.state <> 'voided', i.due_date, a.state`,
        [id],
      )
    ).rows as { installment_id: string; amount: string; state: string }[];
  const nameOf = async (userId: string) => {
    const [user] = (await f.h.superuser('SELECT first_name, last_name FROM users WHERE id = $1', [userId])).rows as {
      first_name: string;
      last_name: string;
    }[];
    return `${user?.first_name ?? ''} ${user?.last_name ?? ''}`;
  };
  const count = async (text: string, values: unknown[] = []) =>
    ((await f.h.superuser(text, values)).rows[0] as { n: number }).n;
  /** Tout ce qu'une validation peut écrire, pour prouver qu'un refus n'a rien changé. */
  const snapshot = async (s: Scenario) => ({
    payments: await Promise.all([s.main, s.other, s.ofMoussa, s.ofB].map(paymentRow)),
    allocations: await Promise.all([s.main, s.other, s.ofMoussa, s.ofB].map(allocationsOf)),
    balances: await balances(s.watched),
    locked: (
      (await f.h.superuser('SELECT financial_terms_locked_at FROM projects WHERE id = $1', [PROJECTS.a])).rows[0] as {
        financial_terms_locked_at: Date | null;
      }
    ).financial_terms_locked_at,
    events: await count(`SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'payment.validated'`),
    audits: await count(`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'payment.validate'`),
  });
  const events = async (paymentId: string) =>
    (
      await f.h.superuser(
        `SELECT association_id, actor_user_id, payload FROM outbox_events
          WHERE event_type = 'payment.validated' AND payload->>'paymentId' = $1`,
        [paymentId],
      )
    ).rows as { association_id: string; actor_user_id: string; payload: Record<string, unknown> }[];
  const audits = async (paymentId: string) =>
    (
      await f.h.superuser(
        `SELECT actor_user_id, association_id, before, after FROM audit_logs
          WHERE action = 'payment.validate' AND entity_id = $1`,
        [paymentId],
      )
    ).rows as { actor_user_id: string; association_id: string; before: unknown; after: unknown }[];

  /**
   * Attend que `n` transactions de l'api (cotiz_app) soient bloquées par un verrou, quel qu'en soit le détenteur (sous
   * verrous ordonnés, la seconde attend souvent la première). Lu hors de toute transaction : pg_stat_activity est figé
   * à sa première lecture dans une transaction.
   */
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

  /** Une transaction tient `lock` pendant `run`, puis le relâche ; renvoie ce qu'elle a fait et le résultat. */
  const holding = async <T>(lock: string, values: unknown[], run: (release: () => Promise<void>) => Promise<T>) => {
    const holder = new pg.Client({ connectionString: f.h.db.superuserUrl });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(lock, values);
      return await run(async () => {
        await holder.query('COMMIT');
      });
    } finally {
      await holder.end();
    }
  };

  /**
   * Verrou pris par une autre transaction pendant que `run` part : les deux requêtes attendent un verrou, puis il est
   * relâché. Rend la concurrence certaine, pas probable.
   */
  const whileLocked = (
    lock: string,
    values: unknown[],
    run: () => [Promise<Response>, Promise<Response>],
  ): Promise<[Response, Response]> =>
    holding(lock, values, async (release) => {
      const pending = run();
      await blocked(2);
      await release();
      return [await pending[0], await pending[1]];
    });

  /**
   * Kofi (entré au début du projet) : mars validé ; `main` = 50 000 F déclarés sur juin et juillet (en attente) ;
   * `other` = 15 000 F déclarés sur septembre (en attente). Moussa : 10 000 F en attente sur novembre. Dans B : un
   * paiement en attente de Fatou sur mars. Reste dû de Kofi hors `main` : 450 000 − 25 000 − 15 000 = 410 000 F.
   */
  const scenario = async () => {
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const moussa = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    const kofiUser = await f.userOf(kofi.id);
    const inst = {
      march: await f.installmentOf(kofi.id, '2026-03-05'),
      june: await f.installmentOf(kofi.id, '2026-06-05'),
      july: await f.installmentOf(kofi.id, '2026-07-05'),
      august: await f.installmentOf(kofi.id, '2026-08-05'),
      september: await f.installmentOf(kofi.id, '2026-09-05'),
      novemberMoussa: await f.installmentOf(moussa.id, '2026-11-05'),
    };
    await f.record({
      enrollmentId: kofi.id,
      userId: kofiUser,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-03-05T08:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-03-05T15:00:00Z',
      lines: [{ installmentId: inst.march, amount: 25000, state: 'confirmed' }],
    });
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
    const ofMoussa = await f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 10000,
      status: 'pending',
      declaredAt: '2026-10-22T08:00:00Z',
      lines: [{ installmentId: inst.novemberMoussa, amount: 10000, state: 'proposed' }],
    });
    const fatou = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    const marchB = await f.installmentOf(fatou.id, '2026-03-05');
    // Échéance de B sans déclaré en attente : ouverte si on la voyait (RLS).
    const aprilB = await f.installmentOf(fatou.id, '2026-04-05');
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
    const watched = [
      inst.march,
      inst.june,
      inst.july,
      inst.august,
      inst.september,
      inst.novemberMoussa,
      marchB,
      aprilB,
    ];
    return { kofi, kofiUser, inst, main, other, ofMoussa, ofB, marchB, aprilB, fatouEnrollment: fatou.id, watched };
  };
  type Scenario = Awaited<ReturnType<typeof scenario>>;

  beforeAll(async () => {
    f = await startLedgerFixture();
  });

  afterAll(() => f.stop());

  beforeEach(async () => {
    await f.resetLedger();
    await f.h.superuser(`DELETE FROM outbox_events WHERE event_type = 'payment.validated'`);
    await f.h.superuser('UPDATE projects SET financial_terms_locked_at = NULL WHERE id = $1', [PROJECTS.a]);
  });

  describe('nominal', () => {
    it('répartition du souscripteur : confirmée, échéances soldées, conditions verrouillées, audit, événement', async () => {
      const s = await scenario();
      expect((await balance(s.inst.june))?.late_since).toBe('2026-06-11');
      const { body, etag } = await validated(s.main);
      expect(etag).toBe('W/"2"');
      expect(body).toMatchObject({
        id: s.main,
        status: 'validated',
        amountDeclared: xof(50000),
        amountReceived: null,
        allocationAdjusted: false,
        reviewedBy: { id: USERS.awa },
        version: 2,
      });
      expect(body.covered.map((c) => [c.installmentId, c.amount, c.state])).toEqual([
        [s.inst.june, xof(25000), 'confirmed'],
        [s.inst.july, xof(25000), 'confirmed'],
      ]);
      // L'auteur peut annuler pendant 10 min ; même horloge pour la validation et sa fenêtre.
      const reviewedAt = new Date(body.reviewedAt ?? '');
      expect(Math.abs(reviewedAt.getTime() - Date.now())).toBeLessThan(60_000);
      expect(body.revertibleUntil).toBe(new Date(reviewedAt.getTime() + 10 * 60_000).toISOString());

      // Propositions annulées (jamais supprimées), répartition finale confirmée.
      expect(await allocationsOf(s.main)).toEqual([
        { installment_id: s.inst.june, amount: '25000', state: 'voided' },
        { installment_id: s.inst.july, amount: '25000', state: 'voided' },
        { installment_id: s.inst.june, amount: '25000', state: 'confirmed' },
        { installment_id: s.inst.july, amount: '25000', state: 'confirmed' },
      ]);
      const [june, july] = await balances([s.inst.june, s.inst.july]);
      for (const b of [june, july]) {
        // En retard à l'inscription (late_since posé), soldée maintenant : plus de date de retard.
        expect(b).toMatchObject({ amount_paid: '25000', amount_pending: '0', status: 'paid', late_since: null });
        expect(b?.paid_at?.toISOString()).toBe(body.reviewedAt);
      }
      // L'autre paiement en attente de Kofi n'est pas touché.
      expect(await allocationsOf(s.other)).toEqual([
        { installment_id: s.inst.september, amount: '15000', state: 'proposed' },
      ]);
      expect(await balance(s.inst.september)).toMatchObject({
        amount_paid: '0',
        amount_pending: '15000',
        status: 'declared',
      });
      expect(await paymentRow(s.other)).toMatchObject({ status: 'pending', version: 1 });
      expect(await paymentRow(s.main)).toMatchObject({
        status: 'validated',
        version: 2,
        amount_received: null,
        reviewed_by: USERS.awa,
      });

      const { locked } = await snapshot(s);
      expect(locked).not.toBeNull();
      expect(await events(s.main)).toEqual([
        {
          association_id: A.id,
          actor_user_id: USERS.awa,
          payload: {
            paymentId: s.main,
            userId: s.kofiUser,
            amountReceived: 50000,
            installmentIds: [s.inst.june, s.inst.july],
          },
        },
      ]);
      const audit = await audits(s.main);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_user_id: USERS.awa,
        association_id: A.id,
        before: expect.objectContaining({ status: 'pending', version: 1 }) as unknown,
        after: expect.objectContaining({ status: 'validated', version: 2 }) as unknown,
      });
    });

    it('un manager valide aussi ; conditions déjà verrouillées : date conservée', async () => {
      const s = await scenario();
      const before = new Date('2026-10-01T00:00:00Z');
      await f.h.superuser('UPDATE projects SET financial_terms_locked_at = $2 WHERE id = $1', [PROJECTS.a, before]);
      const { body } = await validated(s.main, { token: f.tokens.aminata });
      expect(body.reviewedBy).toMatchObject({ id: USERS.aminata });
      expect((await snapshot(s)).locked).toEqual(before);
    });

    it('rejeu de la même clé : même réponse, rien n’est validé deux fois', async () => {
      const s = await scenario();
      const key = crypto.randomUUID();
      const first = await validate(s.main, { key });
      const again = await validate(s.main, { key });
      expect([first.status, again.status]).toEqual([200, 200]);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await again.json()).toEqual(await first.json());
      expect((await allocationsOf(s.main)).filter((a) => a.state === 'confirmed')).toHaveLength(2);
      expect(await balance(s.inst.june)).toMatchObject({ amount_paid: '25000' });
      expect(await events(s.main)).toHaveLength(1);
      expect(await audits(s.main)).toHaveLength(1);
    });
  });

  describe('répartition ajustée et montant reçu', () => {
    it('répartition ajustée : juin et août confirmés, juillet libéré et de nouveau en retard', async () => {
      const s = await scenario();
      const { body } = await validated(s.main, { body: allocate([s.inst.june, 25000], [s.inst.august, 25000]) });
      expect(body.allocationAdjusted).toBe(true);
      expect(body.covered.map((c) => c.installmentId)).toEqual([s.inst.june, s.inst.august]);
      const [june, july, august] = await balances([s.inst.june, s.inst.july, s.inst.august]);
      expect(june).toMatchObject({ amount_paid: '25000', amount_pending: '0', status: 'paid' });
      // Statut recalculé par installmentStatus() : plus rien de déclaré, échue depuis plus de 5 jours.
      expect(july).toMatchObject({ amount_paid: '0', amount_pending: '0', status: 'late', paid_at: null });
      expect(august).toMatchObject({ amount_paid: '25000', amount_pending: '0', status: 'paid' });
      expect((await events(s.main))[0]?.payload).toMatchObject({ installmentIds: [s.inst.june, s.inst.august] });
    });

    it('échéance partagée : seul le déclaré de ce paiement est retiré du montant en attente', async () => {
      const s = await scenario();
      // Septembre : 15 000 F en attente de `other` ; il en reste 10 000 à couvrir.
      await validated(s.main, {
        body: allocate([s.inst.june, 25000], [s.inst.august, 15000], [s.inst.september, 10000]),
      });
      const [august, september] = await balances([s.inst.august, s.inst.september]);
      expect(august).toMatchObject({ amount_paid: '15000', amount_pending: '0', status: 'late', paid_at: null });
      expect(september).toMatchObject({
        amount_paid: '10000',
        amount_pending: '15000',
        status: 'declared',
        paid_at: null,
      });
      expect(await allocationsOf(s.other)).toEqual([
        { installment_id: s.inst.september, amount: '15000', state: 'proposed' },
      ]);
    });

    it('montant reçu différent : la répartition totalise le montant reçu ; juillet partiellement versé', async () => {
      const s = await scenario();
      const { body } = await validated(s.main, {
        body: { amountReceived: xof(40000), ...allocate([s.inst.june, 25000], [s.inst.july, 15000]) },
      });
      expect(body).toMatchObject({
        amountDeclared: xof(50000),
        amountReceived: xof(40000),
        allocationAdjusted: true,
      });
      expect(await paymentRow(s.main)).toMatchObject({ amount_received: '40000' });
      // Versement partiel d'une échéance en retard : toujours en retard (§ 6, règle 4 avant 5).
      expect(await balance(s.inst.july)).toMatchObject({
        amount_paid: '15000',
        amount_pending: '0',
        status: 'late',
        paid_at: null,
      });
      expect((await events(s.main))[0]?.payload).toMatchObject({ amountReceived: 40000 });
    });

    it('montant reçu supérieur au déclaré, ou égal (enregistré comme absent)', async () => {
      const s = await scenario();
      const { body } = await validated(s.main, {
        body: {
          amountReceived: xof(60000),
          ...allocate([s.inst.june, 25000], [s.inst.july, 25000], [s.inst.august, 10000]),
        },
      });
      expect(body).toMatchObject({ amountReceived: xof(60000) });
      expect((await events(s.main))[0]?.payload).toMatchObject({ amountReceived: 60000 });

      await f.resetLedger();
      const t = await scenario();
      const same = await validated(t.main, { body: { amountReceived: xof(50000) } });
      expect(same.body).toMatchObject({ amountReceived: null, allocationAdjusted: false });
      expect(await paymentRow(t.main)).toMatchObject({ amount_received: null });
    });

    it('montant reçu sans répartition : celle du souscripteur ne le totalise pas → allocation_mismatch', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const res = await validate(s.main, { body: { amountReceived: xof(40000) } });
      expect(res.status).toBe(422);
      expect(await problem(res)).toMatchObject({ code: 'allocation_mismatch', expected: 40000, allocated: 50000 });
      expect(await snapshot(s)).toEqual(before);
    });

    it('montant reçu au-delà du reste dû de l’inscription hors ce paiement → amount_exceeds_remaining', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const over = await validate(s.main, { body: { amountReceived: xof(410001) } });
      expect(over.status).toBe(422);
      expect(await problem(over)).toMatchObject({ code: 'amount_exceeds_remaining', maxAmount: 410000 });
      // Borne : tout le reste dû est accepté (ici, la répartition du souscripteur ne le totalise pas).
      const exact = await validate(s.main, { body: { amountReceived: xof(410000) } });
      expect(exact.status).toBe(422);
      expect(await problem(exact)).toMatchObject({ code: 'allocation_mismatch', expected: 410000, allocated: 50000 });
      expect(await snapshot(s)).toEqual(before);
    });
  });

  describe('répartition refusée (rien n’est écrit)', () => {
    it('Σ répartition ≠ montant → allocation_mismatch', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const res = await validate(s.main, { body: allocate([s.inst.june, 25000]) });
      expect(res.status).toBe(422);
      expect(await problem(res)).toMatchObject({ code: 'allocation_mismatch', expected: 50000, allocated: 25000 });
      expect(await snapshot(s)).toEqual(before);
    });

    it('échéance qui reçoit plus que son reste dû → allocation_exceeds_remaining', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const res = await validate(s.main, { body: allocate([s.inst.june, 50000]) });
      expect(res.status).toBe(422);
      expect(await problem(res)).toMatchObject({
        code: 'allocation_exceeds_remaining',
        installmentId: s.inst.june,
        remaining: 25000,
      });
      expect(await snapshot(s)).toEqual(before);
    });

    it('le déclaré en attente des autres paiements compte : septembre n’a plus que 10 000 F', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const res = await validate(s.main, { body: allocate([s.inst.june, 25000], [s.inst.september, 25000]) });
      expect(res.status).toBe(422);
      expect(await problem(res)).toMatchObject({
        code: 'allocation_exceeds_remaining',
        installmentId: s.inst.september,
        remaining: 10000,
      });
      expect(await snapshot(s)).toEqual(before);
    });

    it('échéance payée, dispensée, d’une autre inscription ou association, doublon → 422 validation_failed', async () => {
      const s = await scenario();
      await f.h.superuser(`UPDATE installments SET status = 'waived' WHERE id = $1`, [s.inst.august]);
      const before = await snapshot(s);
      const failed = async (...lines: [string, number][]) => {
        const res = await validate(s.main, { body: allocate(...lines) });
        expect(res.status).toBe(422);
        const body = await problem(res);
        expect(body.code).toBe('validation_failed');
        return body.fields;
      };
      expect(await failed([s.inst.march, 25000], [s.inst.june, 25000])).toEqual({
        [`allocations.${s.inst.march}`]: 'installment_not_open',
      });
      expect(await failed([s.inst.august, 25000], [s.inst.june, 25000])).toEqual({
        [`allocations.${s.inst.august}`]: 'installment_not_open',
      });
      // Novembre de Moussa : ouvert (15 000 F restants), mais d'une autre inscription.
      expect(await failed([s.inst.novemberMoussa, 10000], [s.inst.june, 25000], [s.inst.july, 15000])).toEqual({
        allocations: 'mixed_enrollments',
      });
      // Échéance de B ouverte : invisible sous RLS, donc « pas ouverte », sans révéler qu'elle existe.
      expect(await failed([s.aprilB, 25000], [s.inst.june, 25000])).toEqual({
        [`allocations.${s.aprilB}`]: 'installment_not_open',
      });
      expect(await failed([s.inst.june, 25000], [s.inst.june, 25000])).toEqual({
        [`allocations.${s.inst.june}`]: 'duplicate_installment',
      });
      expect(await failed([s.inst.june, 0], [s.inst.july, 25000], [s.inst.august, 25000])).toMatchObject({
        [`allocations.${s.inst.june}`]: 'allocation_not_positive',
      });
      // Montants dans une autre devise que celle du paiement, montant reçu nul.
      const fields = async (body: unknown) => {
        const res = await validate(s.main, { body });
        expect(res.status).toBe(422);
        const problemBody = await problem(res);
        expect(problemBody.code).toBe('validation_failed');
        return problemBody.fields;
      };
      expect(await fields({ amountReceived: { amount: 50000, currency: 'XAF' } })).toEqual({
        amountReceived: 'currency_mismatch',
      });
      expect(
        await fields({ allocations: [{ installmentId: s.inst.june, amount: { amount: 50000, currency: 'XAF' } }] }),
      ).toEqual({ [`allocations.${s.inst.june}`]: 'currency_mismatch' });
      expect(await fields({ amountReceived: xof(0) })).toEqual({ amountReceived: 'invalid_amount' });
      expect(await snapshot(s)).toEqual(before);
    });
  });

  describe('concurrence et versions', () => {
    it('deux validations simultanées : une seule aboutit, l’autre reçoit 409 avec le nom de qui a traité', async () => {
      const s = await scenario();
      // Les deux requêtes attendent le verrou du paiement, puis passent l'une après l'autre.
      const results = await whileLocked('SELECT 1 FROM payments WHERE id = $1 FOR UPDATE', [s.main], () => [
        validate(s.main, { token: f.tokens.awa }),
        validate(s.main, { token: f.tokens.aminata }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const [winner, loser] = results[0].status === 200 ? results : [results[1], results[0]];
      const reviewer = Detail.parse(await winner.json()).reviewedBy;
      expect(await problem(loser)).toMatchObject({
        code: 'payment_already_reviewed',
        reviewerName: `${reviewer?.firstName ?? ''} ${reviewer?.lastName ?? ''}`,
        paymentStatus: 'validated',
      });
      expect((await allocationsOf(s.main)).filter((a) => a.state === 'confirmed')).toHaveLength(2);
      expect(await balance(s.inst.june)).toMatchObject({ amount_paid: '25000', amount_pending: '0' });
      expect(await events(s.main)).toHaveLength(1);
      expect(await audits(s.main)).toHaveLength(1);
    });

    it('deux paiements validés en même temps sur la même échéance : le second voit le reste dû à jour', async () => {
      const s = await scenario();
      // Août (25 000 F) : 20 000 pour `main`, 15 000 pour `other` ; ensemble, trop. Quel que soit l'ordre, le second
      // voit le reste dû laissé par le premier (5 000 ou 10 000 F) et reçoit un dépassement.
      const results = await whileLocked('SELECT 1 FROM installments WHERE id = $1 FOR UPDATE', [s.inst.august], () => [
        validate(s.main, { body: allocate([s.inst.june, 25000], [s.inst.july, 5000], [s.inst.august, 20000]) }),
        validate(s.other, { body: allocate([s.inst.august, 15000]), token: f.tokens.aminata }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 422]);
      const refused = results.find((r) => r.status === 422);
      expect(await problem(refused ?? results[0])).toMatchObject({
        code: 'allocation_exceeds_remaining',
        installmentId: s.inst.august,
      });
      const august = await balance(s.inst.august);
      expect(Number(august?.amount_paid) + Number(august?.amount_pending)).toBeLessThanOrEqual(25000);
      expect(['15000', '20000']).toContain(august?.amount_paid);
    });

    it('validation et retrait de l’inscription en même temps : aucun interblocage (paiement → projet → échéances)', async () => {
      const s = await scenario();
      // Projet tenu en partage, comme le prend en.withdraw (puis l'inscription et ses échéances futures).
      const [validation, withdrawal] = await holding(
        'SELECT 1 FROM projects WHERE id = $1 FOR SHARE',
        [PROJECTS.a],
        async (release) => {
          const v = validate(s.main);
          await blocked(1);
          const w = f.call(`/associations/${A.id}/enrollments/${s.kofi.id}/withdraw`, {
            token: f.tokens.awa,
            method: 'POST',
          });
          // Le retrait passe, ou attend la validation ; jamais l'inverse en même temps (cycle → 40P01, 500).
          await Promise.race([w, blocked(2)]);
          await release();
          return [await v, await w];
        },
      );
      expect(withdrawal.status).toBe(200);
      expect([200, 422]).toContain(validation.status);
      expect(await drift()).toEqual([]);
    });

    it('If-Match périmé : 412 version_conflict ; absent : 422 ; rien n’est écrit', async () => {
      const s = await scenario();
      const before = await snapshot(s);
      const stale = await validate(s.main, { version: 7 });
      expect(stale.status).toBe(412);
      expect(await problem(stale)).toMatchObject({ code: 'version_conflict' });
      const missing = await validate(s.main, { version: null });
      expect(missing.status).toBe(422);
      expect(await problem(missing)).toMatchObject({ code: 'validation_failed', fields: { 'If-Match': 'required' } });
      expect(await snapshot(s)).toEqual(before);
    });

    it('paiement déjà traité : 409 payment_already_reviewed, prioritaire sur le 412', async () => {
      const s = await scenario();
      await validated(s.main);
      const again = await validate(s.main, { version: 1, token: f.tokens.aminata });
      expect(again.status).toBe(409);
      expect(await problem(again)).toMatchObject({
        code: 'payment_already_reviewed',
        reviewerName: await nameOf(USERS.awa),
        paymentStatus: 'validated',
      });
      // Paiement rejeté : même réponse, avec son statut.
      const rejected = await f.record({
        enrollmentId: s.kofi.id,
        userId: s.kofiUser,
        amount: 25000,
        status: 'rejected',
        declaredAt: '2026-10-05T08:00:00Z',
        reviewedBy: USERS.aminata,
        reviewedAt: '2026-10-05T12:00:00Z',
        rejection: { code: 'not_received', message: null },
        lines: [{ installmentId: s.inst.august, amount: 25000, state: 'voided' }],
      });
      const res = await validate(rejected);
      expect(res.status).toBe(409);
      expect(await problem(res)).toMatchObject({
        code: 'payment_already_reviewed',
        reviewerName: await nameOf(USERS.aminata),
        paymentStatus: 'rejected',
      });
    });
  });

  describe('isolation', () => {
    it('paiement d’une autre association (en attente ou traité) ou inconnu → même 404 ; viewer → 403 ; souscripteur → 404', async () => {
      const s = await scenario();
      // Paiement de B déjà validé par Koffi (gestionnaire de B).
      const reviewedB = await f.record({
        associationId: B.id,
        projectId: PROJECTS.b,
        enrollmentId: s.fatouEnrollment,
        userId: USERS.fatou,
        amount: 25000,
        status: 'validated',
        declaredAt: '2026-10-18T08:00:00Z',
        reviewedBy: USERS.koffi,
        reviewedAt: '2026-10-18T09:00:00Z',
        lines: [{ installmentId: s.aprilB, amount: 25000, state: 'confirmed' }],
      });
      const before = await snapshot(s);
      const [foreign, unknown] = [await validate(s.ofB), await validate(crypto.randomUUID())];
      expect([foreign.status, unknown.status]).toEqual([404, 404]);
      const strip = (body: Record<string, unknown>) => ({ ...body, requestId: undefined });
      expect(strip(await problem(foreign))).toEqual(strip(await problem(unknown)));
      // Paiement de B déjà traité : 404 aussi, jamais un 409 qui livrerait le nom de son gestionnaire.
      const reviewed = await validate(reviewedB);
      expect(reviewed.status).toBe(404);
      expect(strip(await problem(reviewed))).toEqual(strip(await problem(await validate(crypto.randomUUID()))));
      // Koffi : viewer de A (lecture seule), owner de B : le paiement de A par l'URL de B n'existe pas.
      expect((await validate(s.main, { token: f.tokens.koffi })).status).toBe(403);
      expect((await validate(s.main, { aid: B.id, token: f.tokens.koffi })).status).toBe(404);
      expect((await validate(s.ofB, { aid: B.id, token: f.tokens.aminata })).status).toBe(404);
      expect((await validate(s.main, { token: f.tokens.moussa })).status).toBe(404);
      expect(await snapshot(s)).toEqual(before);
    });
  });
});
