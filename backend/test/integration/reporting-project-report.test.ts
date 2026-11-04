import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, B, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { xof } from './projects.fixture.js';

/**
 * Lot 2.6 · étape 1 : rapport d'un projet (rp.report). Vérification du lot : total encaissé = Σ des allocations
 * confirmées ; mêmes chiffres que la grille (lg.grid).
 *
 * Horloge : Date figée (puis qui avance) au 2026-11-08 10:00 UTC. PROJECTS.a : 25 000 F le 5 de chaque mois, du
 * 2026-03-01 au 2027-08-31 (18 échéances, sans fonds d'entrée), délai de grâce 5 jours.
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Report = ENDPOINTS['rp.report'].operations.get.response.body;
const Grid = ENDPOINTS['lg.grid'].operations.get.response.body;
const problemOf = (body: unknown) => ({ ...(body as Record<string, unknown>), requestId: undefined });

describe('rapport de projet (rp.report)', () => {
  let f: LedgerFixture;

  const report = (query = '', options: { aid?: string; pid?: string; token?: string } = {}) =>
    f.call(`/associations/${options.aid ?? A.id}/projects/${options.pid ?? PROJECTS.a}/report${query}`, {
      token: options.token ?? f.tokens.awa,
    });
  const reportOf = async (query = '') => {
    const res = await report(query);
    expect(res.status).toBe(200);
    return Report.parse(await res.json());
  };

  /**
   * Kofi, entré au début du projet : mars et avril validés (50 000 F), mai déclaré à moitié (en attente), juin à
   * octobre en retard, novembre dû. Moussa, entré en novembre : novembre validé et décembre payé d'avance.
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
  });

  it('attendu à date, encaissé, reste, taux ; une ligne par souscripteur', async () => {
    await scenario();
    const r = await reportOf();
    // Attendu : Kofi mars → novembre (9 × 25 000), Moussa novembre. Recouvré : mars, avril, novembre de Moussa.
    expect(r.expected).toEqual(xof(250000));
    expect(r.received).toEqual(xof(100000));
    expect(r.remaining).toEqual(xof(175000));
    expect(r.recoveryRate).toBeCloseTo(0.3, 12);
    expect(r.standingCounts).toEqual({
      up_to_date: 1,
      late: 1,
      signature_required: 0,
      withdrawn: 0,
      activation_pending: 0,
    });
    const rows = new Map(r.rows.map((row) => [row.member.firstName, row]));
    expect(rows.get('Kofi')).toMatchObject({
      expectedToDate: xof(225000),
      paid: xof(50000),
      remaining: xof(175000),
      lateCount: 5,
      lastPaymentOn: '2026-04-06',
    });
    expect(rows.get('Moussa')).toMatchObject({
      expectedToDate: xof(25000),
      paid: xof(50000),
      remaining: xof(0),
      lateCount: 0,
      lastPaymentOn: '2026-11-03',
    });
    expect(r.rows).toHaveLength(2);
  });

  it('collecte et taux cumulé par échéance', async () => {
    await scenario();
    const r = await reportOf();
    expect(r.collectionBySequence).toHaveLength(18);
    expect(r.collectionBySequence[0]).toEqual({
      sequence: 1,
      dueDate: '2026-03-05',
      expected: xof(25000),
      received: xof(25000),
    });
    const november = r.collectionBySequence.find((c) => c.dueDate === '2026-11-05');
    const december = r.collectionBySequence.find((c) => c.dueDate === '2026-12-05');
    expect(november).toMatchObject({ expected: xof(50000), received: xof(25000) });
    expect(december).toMatchObject({ expected: xof(50000), received: xof(25000) });
    expect(r.recoveryRateBySequence.map((p) => p.dueDate)).toEqual([
      '2026-03-05',
      '2026-04-05',
      '2026-05-05',
      '2026-06-05',
      '2026-07-05',
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
    ]);
    expect(r.recoveryRateBySequence[0]?.rate).toBe(1);
    expect(r.recoveryRateBySequence.at(-1)?.rate).toBeCloseTo(r.recoveryRate ?? -1, 12);
  });

  it('vérification du lot : encaissé = Σ des allocations confirmées = Σ des versés de la grille', async () => {
    await scenario();
    const r = await reportOf();
    const [confirmed] = (
      await f.h.superuser(
        `SELECT coalesce(sum(a.amount), 0)::text AS total FROM allocations a JOIN payments p ON p.id = a.payment_id
          WHERE p.project_id = $1 AND a.state = 'confirmed'`,
        [PROJECTS.a],
      )
    ).rows as [{ total: string }];
    expect(r.received.amount).toBe(Number(confirmed.total));

    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/grid?limit=100`, { token: f.tokens.awa });
    const grid = Grid.parse(await res.json());
    const paidInGrid = grid.items.flatMap((row) => row.cells).reduce((sum, c) => sum + c.amountPaid.amount, 0);
    expect(r.received.amount).toBe(paidInGrid);
    // Situations : mêmes compteurs que la grille.
    expect(r.standingCounts).toEqual(grid.facets?.standing);
  });

  it('inscription retirée après avoir payé : son versé reste encaissé, son dû échu reste attendu', async () => {
    await scenario();
    const before = await reportOf();
    const kofi = before.rows.find((row) => row.member.firstName === 'Kofi');
    const [enrollment] = (await f.h.superuser('SELECT id FROM enrollments WHERE user_id = $1', [kofi?.member.id]))
      .rows as [{ id: string }];
    const res = await f.call(`/associations/${A.id}/enrollments/${enrollment.id}/withdraw`, {
      token: f.tokens.awa,
      method: 'POST',
      body: { reason: 'Déménagement' },
    });
    expect(res.status).toBe(200);
    const after = await reportOf();
    // Seules les échéances futures sans versé sont annulées : rien d'échu ne change.
    expect({ expected: after.expected, received: after.received, remaining: after.remaining }).toEqual({
      expected: before.expected,
      received: before.received,
      remaining: before.remaining,
    });
    expect(after.standingCounts).toMatchObject({ withdrawn: 1, late: 0, up_to_date: 1 });
    expect(after.rows.find((row) => row.member.firstName === 'Kofi')).toMatchObject({ paid: xof(50000), lateCount: 5 });
    const [confirmed] = (
      await f.h.superuser(
        `SELECT coalesce(sum(a.amount), 0)::text AS total FROM allocations a JOIN payments p ON p.id = a.payment_id
          WHERE p.project_id = $1 AND a.state = 'confirmed'`,
        [PROJECTS.a],
      )
    ).rows as [{ total: string }];
    expect(after.received.amount).toBe(Number(confirmed.total));
  });

  it('période : seules les échéances de la période comptent', async () => {
    await scenario();
    const r = await reportOf('?from=2026-03-01&to=2026-04-30');
    expect(r.expected).toEqual(xof(50000));
    expect(r.received).toEqual(xof(50000));
    expect(r.recoveryRate).toBeCloseTo(1, 12);
    expect(r.collectionBySequence.map((c) => c.sequence)).toEqual([1, 2]);
  });

  it('projet sans souscripteur : tout à zéro, taux null', async () => {
    const r = await reportOf();
    expect(r).toMatchObject({ expected: xof(0), received: xof(0), recoveryRate: null, rows: [] });
  });

  it('les inscriptions et paiements d’une autre association n’entrent jamais dans le rapport', async () => {
    await scenario();
    const before = await reportOf();
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
    // Contrôle : le paiement de B existe bien, et le rapport de B le compte.
    const resB = await report('', { aid: B.id, pid: PROJECTS.b, token: f.tokens.koffi });
    expect(Report.parse(await resB.json()).received).toEqual(xof(25000));
    expect(await reportOf()).toEqual(before);
  });

  it('lecture seule (viewer) autorisée ; projet d’une autre association ou inconnu, non-membre ou souscripteur → 404', async () => {
    await scenario();
    expect((await report('', { token: f.tokens.koffi })).status).toBe(200);
    const foreign = await report('', { pid: PROJECTS.b });
    const unknown = await report('', { pid: crypto.randomUUID() });
    expect([foreign.status, unknown.status]).toEqual([404, 404]);
    expect(problemOf(await foreign.json())).toEqual(problemOf(await unknown.json()));
    expect((await report('', { aid: B.id, pid: PROJECTS.a, token: f.tokens.koffi })).status).toBe(404);
    expect((await report('', { aid: B.id, pid: PROJECTS.b, token: f.tokens.aminata })).status).toBe(404);
    expect((await report('', { token: f.tokens.moussa })).status).toBe(404);
  });
});
