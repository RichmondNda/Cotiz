import { ENDPOINTS, type EventEnvelope, type EventType } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MANAGER_DASHBOARD_EVENTS,
  ManagerDashboardCacheConsumer,
} from '../../src/modules/reporting/events/manager-dashboard-cache.consumer.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Lot 2.6 · étape 2 : tableau de bord gestionnaire (as.dashboard), en cache 60 s invalidé par événement.
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC (Abidjan, UTC+0). PROJECTS.a : 25 000 F le 5 de
 * chaque mois, du 2026-03-01 au 2027-08-31, délai de grâce 5 jours. Même scénario que rp.report (étape 1).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Dashboard = ENDPOINTS['as.dashboard'].operations.get.response.body;
const Report = ENDPOINTS['rp.report'].operations.get.response.body;
const Codes = ENDPOINTS['mb.codes'].operations.list.response.body;
const problemOf = (body: unknown) => ({ ...(body as Record<string, unknown>), requestId: undefined });

describe('tableau de bord gestionnaire (as.dashboard)', () => {
  let f: LedgerFixture;
  let consumer: ManagerDashboardCacheConsumer;
  let consumers: EventConsumers;

  const dashboard = (options: { aid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/dashboard`, { token: options.token ?? f.tokens.awa });
  const dashboardOf = async (options: { aid?: string; token?: string } = {}) => {
    const res = await dashboard(options);
    expect(res.status).toBe(200);
    return Dashboard.parse(await res.json());
  };
  /** Le consommateur du worker, branché sur les vrais abonnements, comme le relais outbox le ferait. */
  const deliver = async (type: EventType, associationId: string | null, payload: Record<string, unknown> = {}) => {
    const event: EventEnvelope = {
      id: '1',
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      associationId,
      actorUserId: USERS.awa,
      aggregate: { type: 'payment', id: crypto.randomUUID() },
      payload,
    };
    for (const handler of consumers.for(type)) await handler.handle(event);
  };
  const flush = () => f.redis.exec(['redis-cli', 'FLUSHALL']);
  /** Écriture directe en base, sans événement : une nouvelle déclaration en attente de Moussa (janvier). */
  const declareDirectly = async (moussa: { id: string }) =>
    f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-08T09:00:00Z',
      lines: [{ installmentId: await f.installmentOf(moussa.id, '2027-01-05'), amount: 25000, state: 'proposed' }],
    });

  /** Kofi : mars et avril validés en avril, mai déclaré (en attente), juin à octobre en retard ; Moussa entré en novembre. */
  const scenario = async () => {
    const kofi = await f.enrollByApi({
      phone: '+2250711223344',
      firstName: 'Kofi',
      lastName: 'Annan',
      startsFrom: '2026-03-01',
    });
    const moussa = await f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-11-01' });
    const kofiUser = await f.userOf(kofi.id);
    const on = (id: string, date: string) => f.installmentOf(id, date);
    await f.record({
      enrollmentId: kofi.id,
      userId: kofiUser,
      amount: 50000,
      status: 'validated',
      declaredAt: '2026-04-06T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-04-06T15:00:00Z',
      lines: [
        { installmentId: await on(kofi.id, '2026-03-05'), amount: 25000, state: 'confirmed' },
        { installmentId: await on(kofi.id, '2026-04-05'), amount: 25000, state: 'confirmed' },
      ],
    });
    await f.record({
      enrollmentId: kofi.id,
      userId: kofiUser,
      amount: 12500,
      status: 'pending',
      declaredAt: '2026-11-07T08:00:00Z',
      lines: [{ installmentId: await on(kofi.id, '2026-05-05'), amount: 12500, state: 'proposed' }],
    });
    await f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 50000,
      status: 'validated',
      declaredAt: '2026-11-03T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-03T15:00:00Z',
      lines: [
        { installmentId: await on(moussa.id, '2026-11-05'), amount: 25000, state: 'confirmed' },
        { installmentId: await on(moussa.id, '2026-12-05'), amount: 25000, state: 'confirmed' },
      ],
    });
    return { kofi, moussa, kofiUser };
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    consumers = new EventConsumers();
    consumer = new ManagerDashboardCacheConsumer(consumers, f.config);
    consumer.onModuleInit();
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetLedger();
    await flush();
  });

  it('indicateurs : collecté et attendu du mois, à valider, retards, recouvrement, souscripteurs', async () => {
    await scenario();
    const d = await dashboardOf();
    // Novembre : Moussa validé le 3 (25 000 pour novembre + 25 000 d'avance) ; dû : novembre de Kofi et de Moussa.
    expect(d.collectedThisMonth).toEqual(xof(50000));
    expect(d.expectedThisMonth).toEqual(xof(50000));
    expect(d.paymentsToReview).toEqual({ count: 1, oldestDeclaredAt: '2026-11-07T08:00:00.000Z' });
    expect(d.lateSubscribers).toEqual({ count: 1, activeCount: 2 });
    expect(d.subscribersCount).toBe(2);
    expect(d.recoveryRate).toBeCloseTo(0.3, 12);
    const [projects] = (
      await f.h.superuser('SELECT count(*)::int AS n FROM projects WHERE association_id = $1', [A.id])
    ).rows as [{ n: number }];
    expect(d.projectsCount).toBe(projects.n);
    expect(d.unsignedContracts).toEqual([]);
  });

  it('6 derniers mois, le dernier est le mois en cours ; reçu au mois de validation', async () => {
    await scenario();
    const d = await dashboardOf();
    expect(d.monthlyCollection).toEqual([
      { month: '2026-06-01', expected: xof(25000), received: xof(0) },
      { month: '2026-07-01', expected: xof(25000), received: xof(0) },
      { month: '2026-08-01', expected: xof(25000), received: xof(0) },
      { month: '2026-09-01', expected: xof(25000), received: xof(0) },
      { month: '2026-10-01', expected: xof(25000), received: xof(0) },
      { month: '2026-11-01', expected: xof(50000), received: xof(50000) },
    ]);
  });

  it('vérification du lot : mêmes chiffres que le rapport ; projets triés par retards, avec leurs indicateurs', async () => {
    await scenario();
    const d = await dashboardOf();
    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/report`, { token: f.tokens.awa });
    const report = Report.parse(await res.json());
    expect(d.recoveryRate).toBe(report.recoveryRate);

    const [first] = d.projects;
    expect(first?.id).toBe(PROJECTS.a);
    expect(first?.stats).toMatchObject({
      subscribersCount: 2,
      collected: report.received,
      expectedToDate: report.expected,
      recoveryRate: report.recoveryRate,
      lateSubscribersCount: 1,
      pendingPaymentsCount: 1,
      pendingSignaturesCount: 0,
      nextDueDate: '2026-12-05',
    });
    // Projet en inscription sans nombre requis : pas d'objectif d'avancement (collectionProgress).
    expect(first?.stats.progress).toBeNull();
    expect(d.projects.slice(1).every((p) => p.stats.lateSubscribersCount === 0)).toBe(true);
    expect(d.projects).toHaveLength(d.projectsCount);
  });

  it('mois de validation pris dans le fuseau de l’association (UTC+1), bornes du premier mois comprises', async () => {
    const { kofi, kofiUser } = await scenario();
    const validated = async (dueDate: string, reviewedAt: string) =>
      f.record({
        enrollmentId: kofi.id,
        userId: kofiUser,
        amount: 25000,
        status: 'validated',
        declaredAt: reviewedAt,
        reviewedBy: USERS.awa,
        reviewedAt,
        lines: [{ installmentId: await f.installmentOf(kofi.id, dueDate), amount: 25000, state: 'confirmed' }],
      });
    // Lagos (UTC+1) : 31 mai 22:30 UTC = 31 mai 23:30 (hors des 6 mois) ; 31 mai 23:30 UTC = 1er juin 00:30 ;
    // 31 octobre 23:30 UTC = 1er novembre 00:30.
    await validated('2026-06-05', '2026-05-31T22:30:00Z');
    await validated('2026-07-05', '2026-05-31T23:30:00Z');
    await validated('2026-08-05', '2026-10-31T23:30:00Z');
    await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Lagos' WHERE id = $1`, [A.id]);
    try {
      const d = await dashboardOf();
      const received = Object.fromEntries(d.monthlyCollection.map((m) => [m.month, m.received.amount]));
      expect(received).toEqual({
        '2026-06-01': 25000,
        '2026-07-01': 0,
        '2026-08-01': 0,
        '2026-09-01': 0,
        '2026-10-01': 0,
        '2026-11-01': 75000,
      });
      expect(d.collectedThisMonth).toEqual(xof(75000));
    } finally {
      await f.h.superuser(`UPDATE associations SET timezone = 'Africa/Abidjan' WHERE id = $1`, [A.id]);
    }
  });

  it('5 derniers paiements déclarés, les plus récents d’abord, tous statuts', async () => {
    await scenario();
    const d = await dashboardOf();
    expect(d.latestPayments.map((p) => [p.declaredAt, p.status])).toEqual([
      ['2026-11-07T08:00:00.000Z', 'pending'],
      ['2026-11-03T09:00:00.000Z', 'validated'],
      ['2026-04-06T09:00:00.000Z', 'validated'],
    ]);
  });

  it('comptes non activés : même nombre que « Codes à remettre » non remis', async () => {
    await scenario();
    const d = await dashboardOf();
    const res = await f.call(`/associations/${A.id}/activation-codes?handed=false`, { token: f.tokens.awa });
    const codes = Codes.parse(await res.json());
    expect(d.activationCodesToHand).toBe(codes.total);
    // Kofi, compte créé par l'association à son inscription.
    expect(d.activationCodesToHand).toBeGreaterThanOrEqual(1);
  });

  it('inscription retirée : ni souscripteur ni retard, mais son versé et son dû échu restent', async () => {
    const { kofi } = await scenario();
    const before = await dashboardOf();
    const res = await f.call(`/associations/${A.id}/enrollments/${kofi.id}/withdraw`, {
      token: f.tokens.awa,
      method: 'POST',
      body: { reason: 'Déménagement' },
    });
    expect(res.status).toBe(200);
    await flush();
    const after = await dashboardOf();
    expect(after.subscribersCount).toBe(1);
    expect(after.lateSubscribers).toEqual({ count: 0, activeCount: 1 });
    expect(after.recoveryRate).toBe(before.recoveryRate);
  });

  it('association sans activité : zéros, taux null, six mois vides', async () => {
    const d = await dashboardOf();
    expect(d).toMatchObject({
      collectedThisMonth: xof(0),
      expectedThisMonth: xof(0),
      paymentsToReview: { count: 0, oldestDeclaredAt: null },
      lateSubscribers: { count: 0, activeCount: 0 },
      recoveryRate: null,
      subscribersCount: 0,
      latestPayments: [],
    });
    expect(d.monthlyCollection).toHaveLength(6);
  });

  describe('cache 60 s', () => {
    it('servi depuis le cache (TTL ≤ 60 s) ; un événement de l’association l’invalide', async () => {
      const { moussa } = await scenario();
      const first = await dashboardOf();
      const ttl = Number((await f.redis.exec(['redis-cli', 'TTL', `cotiz:cache:as.dashboard:${A.id}`])).output.trim());
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(60);

      // Écriture directe en base (aucun événement) : le cache sert encore l'ancien chiffre.
      await declareDirectly(moussa);
      expect((await dashboardOf()).paymentsToReview).toEqual(first.paymentsToReview);

      await deliver('payment.declared', A.id);
      expect((await dashboardOf()).paymentsToReview.count).toBe(2);
    });

    it('un événement d’une autre association n’invalide pas ce cache', async () => {
      const { moussa } = await scenario();
      await dashboardOf();
      await declareDirectly(moussa);
      await deliver('payment.declared', B.id);
      expect((await dashboardOf()).paymentsToReview.count).toBe(1);
    });

    it('user.activated invalide les associations de la personne', async () => {
      const { moussa } = await scenario();
      await dashboardOf();
      await declareDirectly(moussa);
      await deliver('user.activated', null, { userId: USERS.moussa, associationIds: [A.id] });
      expect((await dashboardOf()).paymentsToReview.count).toBe(2);
    });

    it('les événements « cache: KPI » d’events.yaml sont écoutés', () => {
      for (const type of ['member.enrolled', 'member.withdrawn', 'payment.validated', 'installment.late'] as const) {
        expect(MANAGER_DASHBOARD_EVENTS).toContain(type);
        expect(consumers.for(type)).toHaveLength(1);
      }
    });

    it('le cache d’une association n’est jamais servi à une autre', async () => {
      await scenario();
      const a = await dashboardOf();
      const b = await dashboardOf({ aid: B.id, token: f.tokens.koffi });
      expect(b.subscribersCount).not.toBe(a.subscribersCount);
      expect(b.latestPayments).toEqual([]);
    });
  });

  it('isolation : les inscriptions et paiements d’une autre association n’y entrent jamais', async () => {
    await scenario();
    const before = await dashboardOf();
    const ofB = await f.enrollByApi(
      { userId: USERS.fatou, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: ofB.id,
      userId: USERS.fatou,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-11-04T09:00:00Z',
      reviewedBy: USERS.koffi,
      reviewedAt: '2026-11-04T15:00:00Z',
      lines: [{ installmentId: await f.installmentOf(ofB.id, '2026-03-05'), amount: 25000, state: 'confirmed' }],
    });
    await flush();
    // Contrôle : le tableau de bord de B compte bien son paiement.
    const ofBDashboard = await dashboardOf({ aid: B.id, token: f.tokens.koffi });
    expect(ofBDashboard.collectedThisMonth).toEqual(xof(25000));
    expect(await dashboardOf()).toEqual(before);
  });

  it('lecture seule (viewer) autorisée ; non-membre ou souscripteur → 404, comme une association inconnue', async () => {
    expect((await dashboard({ token: f.tokens.koffi })).status).toBe(200);
    const foreign = await dashboard({ aid: B.id, token: f.tokens.aminata });
    const unknown = await dashboard({ aid: crypto.randomUUID() });
    expect([foreign.status, unknown.status]).toEqual([404, 404]);
    expect(problemOf(await foreign.json())).toEqual(problemOf(await unknown.json()));
    expect((await dashboard({ token: f.tokens.moussa })).status).toBe(404);
  });
});
