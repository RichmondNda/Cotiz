import { ENDPOINTS, Problem } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';
import { METHODS } from './projects.fixture.js';

/**
 * Lot 3.2 · étape 2 : me.projects (projets et échéances ouvertes) et me.project (échéancier, paiements, moyens de
 * paiement de l'association), réponses conformes au contrat.
 * Horloge : 2026-11-08 10:00 UTC (Abidjan). PROJECTS.a : 25 000 F le 5 de chaque mois, du 2026-03-01 au 2027-08-31,
 * délai de grâce 5 jours : à cette date, mars à novembre sont échues (novembre pas encore en retard).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const Projects = ENDPOINTS['me.projects'].operations.list.response.body;
const Detail = ENDPOINTS['me.project'].operations.get.response.body;
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('me.projects et me.project', () => {
  let f: LedgerFixture;

  const get = (path: string, token = f.tokens.moussa) => f.call(path, { token });
  const projectsOf = async () => {
    const res = await get('/me/projects');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    return Projects.parse(await res.json());
  };
  const detailOf = async (pid: string) => {
    const res = await get(`/me/projects/${pid}`);
    expect(res.status).toBe(200);
    return Detail.parse(await res.json());
  };
  /** Moussa sur PROJECTS.a, mars payé (validé), avril couvert par une déclaration en attente, mai rejeté. */
  const scenario = async () => {
    const moussa = await f.enrollByApi(
      { userId: USERS.moussa, startsFrom: '2026-03-01' },
      { aid: A.id, pid: PROJECTS.a },
    );
    const march = await f.installmentOf(moussa.id, '2026-03-05');
    const april = await f.installmentOf(moussa.id, '2026-04-05');
    const may = await f.installmentOf(moussa.id, '2026-05-05');
    const validated = await f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 25000,
      status: 'validated',
      declaredAt: '2026-03-05T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-03-06T09:00:00Z',
      lines: [{ installmentId: march, amount: 25000, state: 'confirmed' }],
    });
    const pending = await f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 25000,
      status: 'pending',
      declaredAt: '2026-11-07T09:00:00Z',
      lines: [{ installmentId: april, amount: 25000, state: 'proposed' }],
    });
    const rejected = await f.record({
      enrollmentId: moussa.id,
      userId: USERS.moussa,
      amount: 25000,
      status: 'rejected',
      declaredAt: '2026-11-01T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-02T09:00:00Z',
      rejection: { code: 'not_received', message: 'Rien reçu sur Orange Money' },
      lines: [{ installmentId: may, amount: 25000, state: 'voided' }],
    });
    return { moussa, march, april, may, validated, pending, rejected };
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
    await f.h.superuser('DELETE FROM project_payment_methods');
    await f.redis.exec(['redis-cli', 'FLUSHALL']);
  });

  it('me.projects : la carte et les échéances ouvertes (ni payée, ni entièrement déclarée)', async () => {
    const { moussa, march, april, may } = await scenario();
    const { items } = await projectsOf();
    expect(items).toHaveLength(1);
    const [card] = items;
    expect(card).toMatchObject({
      enrollmentId: moussa.id,
      project: { id: PROJECTS.a, name: 'Centre communautaire' },
      association: { id: A.id },
      standing: 'late',
      paid: XOF(25000),
      remaining: XOF(18 * 25000 - 25000),
      commitment: XOF(18 * 25000),
      // Retards : mai (rejeté) à octobre ; avril est couvert par la déclaration en attente.
      late: { count: 6, amount: XOF(6 * 25000), since: '2026-05-05' },
      nextDue: { dueDate: '2026-11-05', amount: XOF(25000) },
    });
    const open = card?.openInstallments.map((i) => i.id) ?? [];
    expect(open).not.toContain(march);
    expect(open).not.toContain(april);
    expect(open).toContain(may);
    expect(open).toHaveLength(16);
  });

  it('me.project : conditions, échéancier complet, paiements (plus récents d’abord), contrat', async () => {
    const { moussa, march, validated, pending, rejected } = await scenario();
    const d = await detailOf(PROJECTS.a);
    expect(d.enrollmentId).toBe(moussa.id);
    expect(d.terms).toEqual({
      entryFee: null,
      installmentAmount: XOF(25000),
      frequency: 'monthly',
      dueDay: 5,
      scheduleType: 'fixed',
      startDate: '2026-03-01',
      endDate: '2027-08-31',
    });
    expect(d.installments).toHaveLength(18);
    expect(d.installments.find((i) => i.id === march)).toMatchObject({ status: 'paid', remaining: XOF(0) });
    expect(d.payments.map((p) => [p.id, p.status])).toEqual([
      [pending, 'pending'],
      [rejected, 'rejected'],
      [validated, 'validated'],
    ]);
    expect(d.payments[1]?.rejection).toEqual({ reasonCode: 'not_received', message: 'Rien reçu sur Orange Money' });
    expect(d.payments[0]?.covered).toEqual([
      expect.objectContaining({ dueDate: '2026-04-05', amount: XOF(25000), state: 'proposed' }),
    ]);
    expect(d.contract).toEqual({ required: false, signedAt: null });
  });

  it('moyens de paiement : ceux de l’association, actifs ; ceux retenus par le projet, avec leur consigne', async () => {
    await scenario();
    expect((await detailOf(PROJECTS.a)).paymentMethods.map((m) => m.id)).toEqual([METHODS.orangeA]);
    await f.h.superuser(
      `INSERT INTO project_payment_methods (project_id, payment_method_id, association_id, instructions_override)
       VALUES ($1, $2, $3, 'Référence : votre nom'), ($1, $4, $3, NULL)`,
      [PROJECTS.a, METHODS.orangeA, A.id, METHODS.waveInactiveA],
    );
    const methods = (await detailOf(PROJECTS.a)).paymentMethods;
    expect(methods.map((m) => [m.id, m.instructions])).toEqual([[METHODS.orangeA, 'Référence : votre nom']]);
  });

  it('projet sans inscription de la personne → 404 not_found', async () => {
    await scenario();
    for (const pid of [PROJECTS.a2, PROJECTS.b, crypto.randomUUID()]) {
      const res = await get(`/me/projects/${pid}`);
      expect(res.status).toBe(404);
      expect(Problem.parse(await res.json()).code).toBe('not_found');
    }
  });

  it('inscription retirée : hors de la liste, détail → 404', async () => {
    const { moussa } = await scenario();
    await f.h.superuser(`UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = $1`, [moussa.id]);
    expect((await projectsOf()).items).toEqual([]);
    expect((await get(`/me/projects/${PROJECTS.a}`)).status).toBe(404);
  });

  it('jeton gestionnaire refusé (espace souscripteur seulement)', async () => {
    expect((await get('/me/projects', f.tokens.awa)).status).toBe(403);
    expect((await get(`/me/projects/${PROJECTS.a}`, f.tokens.awa)).status).toBe(403);
  });
});
