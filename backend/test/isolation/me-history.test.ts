import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type LedgerFixture, startLedgerFixture } from '../integration/ledger.fixture.js';
import { PROJECTS } from '../integration/members.fixture.js';
import { A, B, USERS } from './harness.js';

/**
 * Lot 3.4 : isolation de l'historique du souscripteur (me.history, liste et série).
 * Appartenances du jeu : A — Awa propriétaire, Moussa souscripteur, Fatou souscriptrice retirée ; B — Koffi
 * propriétaire, Fatou et Awa souscriptrices. Chacun ne voit que ses paiements, dans les associations où il est
 * souscripteur actif ; ceux d'une inscription retirée restent présentés, marqués (décision du 2026-11-10), mais
 * jamais dans le reste ni l'objectif ; les totaux n'additionnent rien d'autrui. Politiques élargies : le filtre du
 * code tient seul (inscription retirée d'autrui ; inscription retirée de Moussa dans B, où il n'est pas membre).
 */

const NOW = new Date('2026-11-08T10:00:00Z');
const History = ENDPOINTS['me.history'].operations.list.response.body;
const Series = ENDPOINTS['me.history'].operations.series.response.body;
const everyone = { using: 'true', withCheck: null };
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('isolation : historique du souscripteur (me.history)', () => {
  let f: LedgerFixture;
  let awaSubscriber: string;
  let fatou: string;

  /**
   * Inscription active avec une échéance de `amount` au 2026-10-05 (renvoyée), et pour autrui (`unpaid`) une seconde de
   * 50 000 F au 2026-11-05 jamais réglée : leur reste et leur engagement ne sont pas nuls, une fuite les ferait voir.
   */
  const enrolled = async (projectId: string, userId: string, associationId: string, amount: number, unpaid = true) => {
    const enrollmentId = await f.enroll(projectId, userId, associationId);
    const installmentId = crypto.randomUUID();
    const insert = (id: string, sequence: number, dueDate: string, due: number) =>
      f.h.superuser(
        `INSERT INTO installments (id, association_id, project_id, enrollment_id, user_id, kind, sequence, due_date,
                                   amount_due, status)
         VALUES ($1, $2, $3, $4, $5, 'periodic', $6, $7, $8, 'due')`,
        [id, associationId, projectId, enrollmentId, userId, sequence, dueDate, due],
      );
    await insert(installmentId, 1, '2026-10-05', amount);
    if (unpaid) await insert(crypto.randomUUID(), 2, '2026-11-05', 50000);
    return { enrollmentId, installmentId };
  };
  /** Paiement validé de tout le dû de l'échéance (versé = montant), déclaré à `declaredAt`. */
  const validated = (
    e: { enrollmentId: string; installmentId: string },
    userId: string,
    associationId: string,
    projectId: string,
    amount: number,
    declaredAt = '2026-10-05T09:00:00Z',
  ) =>
    f.record({
      enrollmentId: e.enrollmentId,
      userId,
      associationId,
      projectId,
      amount,
      status: 'validated',
      declaredAt,
      reviewedBy: USERS.awa,
      reviewedAt: declaredAt,
      lines: [{ installmentId: e.installmentId, amount, state: 'confirmed' }],
    });
  /**
   * Moussa : 25 000 F validés sur PROJECTS.a. Autrui, mêmes projet et association (Fatou retirée, Awa gestionnaire) :
   * 40 000 F et 30 000 F, déclarés plus tard (en tête sans le filtre sur la personne). Sur PROJECTS.b : Fatou 15 000 F,
   * Awa 20 000 F.
   */
  const scenario = async () => {
    const moussaA = await enrolled(PROJECTS.a, USERS.moussa, A.id, 25000, false);
    // Inscription retirée de Moussa (appartenance toujours active) avec un paiement validé : présentée, marquée.
    const moussaWithdrawn = await enrolled(PROJECTS.a2, USERS.moussa, A.id, 60000, false);
    // Inscription retirée de Moussa dans B, où il n'est pas souscripteur (association quittée) : jamais présentée.
    const moussaB = await enrolled(PROJECTS.b, USERS.moussa, B.id, 70000, false);
    const fatouA = await enrolled(PROJECTS.a, USERS.fatou, A.id, 40000);
    const awaA = await enrolled(PROJECTS.a, USERS.awa, A.id, 30000);
    const fatouB = await enrolled(PROJECTS.b, USERS.fatou, B.id, 15000);
    const awaB = await enrolled(PROJECTS.b, USERS.awa, B.id, 20000);
    const withdrawnPayment = await validated(moussaWithdrawn, USERS.moussa, A.id, PROJECTS.a2, 60000);
    const outsidePayment = await validated(moussaB, USERS.moussa, B.id, PROJECTS.b, 70000);
    const fatouAPayment = await validated(fatouA, USERS.fatou, A.id, PROJECTS.a, 40000, '2026-10-06T09:00:00Z');
    // Retirées : celle de Moussa dans A et dans B, celle de Fatou dans A (inscription retirée d'autrui).
    await f.h.superuser(
      `UPDATE enrollments SET status = 'withdrawn', withdrawn_at = now() WHERE id = ANY($1::uuid[])`,
      [[moussaWithdrawn.enrollmentId, moussaB.enrollmentId, fatouA.enrollmentId]],
    );
    return {
      withdrawnPayment,
      outsidePayment,
      moussaA: await validated(moussaA, USERS.moussa, A.id, PROJECTS.a, 25000),
      fatouA: fatouAPayment,
      awaA: await validated(awaA, USERS.awa, A.id, PROJECTS.a, 30000, '2026-10-07T09:00:00Z'),
      fatouB: await validated(fatouB, USERS.fatou, B.id, PROJECTS.b, 15000),
      awaB: await validated(awaB, USERS.awa, B.id, PROJECTS.b, 20000),
    };
  };

  const historyOf = async (token: string, query = '') => {
    const res = await f.call(`/me/history${query}`, { token });
    expect(res.status).toBe(200);
    return History.parse(await res.json());
  };
  const seriesOf = async (token: string, query = '') => {
    const res = await f.call(`/me/history/series${query}`, { token });
    expect(res.status).toBe(200);
    return Series.parse(await res.json());
  };
  /**
   * Ce que voit Moussa : son paiement et celui de son inscription retirée de A (marqué), ni celui de son inscription
   * de B (pas membre), ni ceux d'autrui ; versé 85 000 F, reste 0, objectif 25 000 F (la retirée n'engage pas).
   */
  const moussaSeesOnlyHis = async (p: { moussaA: string; withdrawnPayment: string; outsidePayment: string }) => {
    const h = await historyOf(f.tokens.moussa, '?limit=100');
    expect(new Set(h.items.map((x) => x.id))).toEqual(new Set([p.moussaA, p.withdrawnPayment]));
    expect(h.items.map((x) => [x.id, x.enrollmentWithdrawn]).sort()).toEqual(
      [
        [p.moussaA, false],
        [p.withdrawnPayment, true],
      ].sort(),
    );
    expect(h.total).toBe(2);
    expect(h.summary).toEqual({ totalPaid: XOF(85000), paymentsCount: 2, remaining: XOF(0) });
    const first = await historyOf(f.tokens.moussa, '?limit=1');
    expect(first.total).toBe(2);
    const october = await historyOf(f.tokens.moussa, '?from=2026-10-01&to=2026-10-31');
    expect(october.items.map((x) => x.id).sort()).toEqual([p.moussaA, p.withdrawnPayment].sort());
    const s = await seriesOf(f.tokens.moussa);
    expect(s.target).toEqual(XOF(25000));
    expect(s.cumulative).toEqual([{ month: '2026-10-01', paid: XOF(85000) }]);
    expect(s.byMonth).toEqual([
      {
        month: '2026-10-01',
        projects: expect.arrayContaining([
          { projectId: PROJECTS.a, paid: XOF(25000) },
          { projectId: PROJECTS.a2, paid: XOF(60000) },
        ]) as unknown,
      },
    ]);
    expect(s.byMonth[0]?.projects).toHaveLength(2);
    // Détail : son paiement retiré oui (marqué) ; celui de B (pas membre) et celui de Fatou : 404 comme inconnus.
    const detail = await f.call(`/me/payments/${p.withdrawnPayment}`, { token: f.tokens.moussa });
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { enrollmentWithdrawn: boolean }).enrollmentWithdrawn).toBe(true);
    expect((await f.call(`/me/payments/${p.outsidePayment}`, { token: f.tokens.moussa })).status).toBe(404);
    // Filtrer sur l'association ou le projet d'autrui ne montre rien.
    for (const query of [`?associationId=${B.id}`, `?projectId=${PROJECTS.b}`]) {
      expect((await historyOf(f.tokens.moussa, query)).items).toEqual([]);
      expect((await seriesOf(f.tokens.moussa, query)).cumulative).toEqual([]);
    }
  };

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true, now: NOW });
    f = await startLedgerFixture();
    [awaSubscriber, fatou] = await Promise.all([
      f.login('subscriber', 'awa@test.cotiz.app'),
      f.login('subscriber', 'fatou@test.cotiz.app'),
    ]);
  });
  afterAll(async () => {
    await f.stop();
    vi.useRealTimers();
  });
  beforeEach(async () => {
    await f.resetLedger();
  });

  it('chacun ses paiements ; appartenance retirée ou gestionnaire seulement : rien de cette association', async () => {
    const p = await scenario();
    await moussaSeesOnlyHis(p);
    // Fatou n'est plus souscriptrice de A, Awa n'en est que gestionnaire : seuls leurs paiements de B.
    const fatouHistory = await historyOf(fatou, '?limit=100');
    expect(fatouHistory.items.map((x) => x.id)).toEqual([p.fatouB]);
    expect(fatouHistory.summary.totalPaid).toEqual(XOF(15000));
    const awaHistory = await historyOf(awaSubscriber, '?limit=100');
    expect(awaHistory.items.map((x) => x.id)).toEqual([p.awaB]);
    expect((await seriesOf(awaSubscriber)).cumulative).toEqual([{ month: '2026-10-01', paid: XOF(20000) }]);
    expect((await f.call('/me/history', { token: f.tokens.awa })).status).toBe(403);
  });

  it('politiques élargies (paiements, inscriptions, échéances, répartitions) : toujours rien d’autrui', async () => {
    const p = await scenario();
    await f.h.withPolicy('payments', 'subscriber_self_read', everyone, () =>
      f.h.withPolicy('enrollments', 'subscriber_self_read', everyone, () =>
        f.h.withPolicy('installments', 'subscriber_self_read', everyone, () =>
          f.h.withPolicy('allocations', 'subscriber_self_read', everyone, async () => {
            await moussaSeesOnlyHis(p);
            expect((await f.call(`/me/payments/${p.fatouA}`, { token: f.tokens.moussa })).status).toBe(404);
          }),
        ),
      ),
    );
  });
});
