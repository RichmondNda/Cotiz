import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProjectFigures } from '../../src/modules/reporting/reporting.public.js';
import { TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { A, asManagerOf, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Indicateurs des projets hors tableau de bord (suivi du lot 2.6) : pr.list, pr.get, pr.overview et la réponse de
 * pr.patch donnent les mêmes chiffres que as.dashboard et rp.report (ProjectFigures, reporting).
 *
 * Horloge : Date figée au 2026-11-08 10:00 UTC (Abidjan). PROJECTS.a : 25 000 F le 5 de chaque mois, du 2026-03-01 au
 * 2027-08-31, délai de grâce 5 jours. Scénario de reporting-manager-dashboard.test.ts : Kofi (mars et avril validés,
 * mai déclaré pour moitié, juin à octobre en retard), Moussa entré en novembre (novembre et décembre validés).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const List = ENDPOINTS['pr.list'].operations.list.response.body;
const Project = ENDPOINTS['pr.get'].operations.get.response.body;
const Overview = ENDPOINTS['pr.overview'].operations.get.response.body;
const Dashboard = ENDPOINTS['as.dashboard'].operations.get.response.body;
const Report = ENDPOINTS['rp.report'].operations.get.response.body;

describe('indicateurs des projets (pr.list, pr.get, pr.overview)', () => {
  let f: LedgerFixture;

  const read = async <T>(path: string, schema: { parse: (v: unknown) => T }, token = f.tokens.awa) => {
    const res = await f.call(path, { token });
    expect(res.status).toBe(200);
    return schema.parse(await res.json());
  };
  const overviewOf = (pid = PROJECTS.a) => read(`/associations/${A.id}/projects/${pid}/overview`, Overview);
  const setStatus = (status: string) =>
    f.h.superuser('UPDATE projects SET status = $2 WHERE id = $1', [PROJECTS.a, status]);

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
  });

  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    await f.resetLedger();
    await setStatus('enrolling');
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
  });

  it('pr.list et pr.get : mêmes indicateurs que les cartes projet du tableau de bord', async () => {
    await scenario();
    const dashboard = await read(`/associations/${A.id}/dashboard`, Dashboard);
    const list = await read(`/associations/${A.id}/projects`, List);
    const project = await read(`/associations/${A.id}/projects/${PROJECTS.a}`, Project);
    const fromDashboard = dashboard.projects.find((p) => p.id === PROJECTS.a)?.stats;
    expect(fromDashboard).toMatchObject({
      subscribersCount: 2,
      collected: xof(100000),
      expectedToDate: xof(250000),
      lateSubscribersCount: 1,
      pendingPaymentsCount: 1,
      nextDueDate: '2026-12-05',
    });
    expect(list.items.find((p) => p.id === PROJECTS.a)?.stats).toEqual(fromDashboard);
    expect(project.stats).toEqual(fromDashboard);
    // Tous les projets de la page : mêmes indicateurs que le tableau de bord.
    for (const item of list.items) {
      expect(item.stats).toEqual(dashboard.projects.find((p) => p.id === item.id)?.stats);
    }
  });

  it('pr.overview : mêmes chiffres que rp.report et pr.get ; retards, prochaine échéance, paiements à valider', async () => {
    const { kofi } = await scenario();
    const overview = await overviewOf();
    const report = await read(`/associations/${A.id}/projects/${PROJECTS.a}/report`, Report);
    const project = await read(`/associations/${A.id}/projects/${PROJECTS.a}`, Project);

    expect(overview.collected).toEqual(report.received);
    expect(overview.expectedToDate).toEqual(report.expected);
    expect(overview.recoveryRate).toBe(report.recoveryRate);
    expect(overview.collected).toEqual(project.stats.collected);
    expect(overview.recoveryRate).toBeCloseTo(0.3, 12);

    // Kofi : juin à octobre en retard (mai déclaré n'est pas en retard), 5 × 25 000 F, depuis la fin de la grâce de juin.
    expect(overview.late).toEqual({ count: project.stats.lateSubscribersCount, amount: xof(125000) });
    expect(overview.lateMembers).toEqual([
      {
        member: expect.objectContaining({ firstName: 'Kofi', lastName: 'Annan' }) as unknown,
        enrollmentId: kofi.id,
        lateInstallments: 5,
        amountDue: xof(125000),
        lateSince: '2026-06-11',
        lateDueDates: ['2026-06-05', '2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05'],
      },
    ]);
    // Décembre : dû de Kofi et de Moussa (le versé anticipé de Moussa n'est pas déduit).
    expect(overview.nextDue).toEqual({ dueDate: '2026-12-05', expectedTotal: xof(50000) });
    expect(overview.enrollment).toEqual({ count: 2, required: project.requiredSubscribers });
    expect(overview.paymentsToReview).toEqual({ count: 1, oldestDeclaredAt: '2026-11-07T08:00:00.000Z' });
    expect(overview.unsignedContracts).toEqual([]);
    // Inscriptions ouvertes : pas encore de collecte par échéance.
    expect(overview.collectionBySequence).toEqual([]);
  });

  it('pr.overview, projet en cours : collecte par échéance du calendrier, rang du projet conservé', async () => {
    await scenario();
    await setStatus('active');
    const overview = await overviewOf();
    const report = await read(`/associations/${A.id}/projects/${PROJECTS.a}/report`, Report);
    expect(overview.collectionBySequence).toHaveLength(18);
    expect(overview.collectionBySequence[0]).toEqual({
      sequence: 1,
      dueDate: '2026-03-05',
      expected: xof(25000),
      received: xof(25000),
    });
    // Novembre (rang 9) : Kofi et Moussa dus, Moussa seul a payé.
    expect(overview.collectionBySequence[8]).toEqual({
      sequence: 9,
      dueDate: '2026-11-05',
      expected: xof(50000),
      received: xof(25000),
    });
    // Mêmes valeurs que le rapport pour les rangs qui ont des échéances.
    expect(report.collectionBySequence.length).toBeGreaterThan(0);
    for (const c of report.collectionBySequence) {
      expect(overview.collectionBySequence.find((o) => o.sequence === c.sequence)).toEqual(c);
    }
  });

  it('pr.patch : la réponse porte les indicateurs, comme pr.get', async () => {
    await scenario();
    const before = await read(`/associations/${A.id}/projects/${PROJECTS.a}`, Project);
    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}`, {
      token: f.tokens.awa,
      method: 'PATCH',
      body: { description: 'Suivi des indicateurs' },
      headers: { 'if-match': `W/"${String(before.version)}"` },
    });
    expect(res.status).toBe(200);
    const after = Project.parse(await res.json());
    expect(after.stats).toEqual(before.stats);
    expect(after.stats.subscribersCount).toBe(2);
  });

  it('isolation : inscriptions et paiements d’une autre association n’entrent jamais dans ces chiffres', async () => {
    await scenario();
    const before = await overviewOf();
    const ofB = await f.enrollByApi(
      { userId: USERS.awa, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: ofB.id,
      userId: USERS.awa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-06T08:00:00Z',
      lines: [{ installmentId: await f.installmentOf(ofB.id, '2026-11-05'), amount: 25000, state: 'proposed' }],
    });
    expect(await overviewOf()).toEqual(before);
    const list = await read(`/associations/${A.id}/projects`, List);
    expect(list.items.some((p) => p.id === PROJECTS.b)).toBe(false);
    expect(list.items.find((p) => p.id === PROJECTS.a)?.stats.pendingPaymentsCount).toBe(1);
  });

  it('isolation : dans le contexte de A, le projet de B n’a aucune inscription ni paiement ; B lui-même est refusé', async () => {
    await scenario();
    const ofB = await f.enrollByApi(
      { userId: USERS.awa, startsFrom: '2026-03-01' },
      { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi },
    );
    await f.record({
      associationId: B.id,
      projectId: PROJECTS.b,
      enrollmentId: ofB.id,
      userId: USERS.awa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-06T08:00:00Z',
      lines: [{ installmentId: await f.installmentOf(ofB.id, '2026-11-05'), amount: 25000, state: 'proposed' }],
    });
    const projectB = await read(`/associations/${B.id}/projects/${PROJECTS.b}`, Project, f.tokens.koffi);
    expect(projectB.stats).toMatchObject({ subscribersCount: 1, pendingPaymentsCount: 1 });

    const figures = f.app.get(ProjectFigures, { strict: false });
    const db = new TenantDatabase({ connectionString: f.h.db.urlFor('cotiz_app'), max: 1 });
    try {
      // Identifiant du projet de B passé dans le contexte de A : ni ses inscriptions ni ses paiements (RLS, filtres).
      const [seenFromA] = await db.withTenantContext(asManagerOf(A), () => figures.withStats(A.id, [projectB]));
      expect(seenFromA?.stats).toMatchObject({
        subscribersCount: 0,
        collected: xof(0),
        pendingPaymentsCount: 0,
        pendingSignaturesCount: 0,
        nextDueDate: null,
      });
      await expect(db.withTenantContext(asManagerOf(A), () => figures.withStats(B.id, [projectB]))).rejects.toThrow(
        /contexte de cette association/,
      );
    } finally {
      await db.onModuleDestroy();
    }
  });

  it('projet sans inscription : indicateurs à zéro, comme avant', async () => {
    const overview = await overviewOf();
    expect(overview).toMatchObject({
      collected: xof(0),
      expectedToDate: xof(0),
      recoveryRate: null,
      late: { count: 0, amount: xof(0) },
      nextDue: null,
      lateMembers: [],
    });
    const project = await read(`/associations/${A.id}/projects/${PROJECTS.a}`, Project);
    expect(project.stats).toMatchObject({ subscribersCount: 0, collected: xof(0), nextDueDate: null });
  });
});
