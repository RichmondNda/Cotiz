import { ENDPOINTS } from '@cotiz/contracts';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { A, USERS } from '../isolation/harness.js';
import { type LedgerFixture, startLedgerFixture } from './ledger.fixture.js';
import { PROJECTS } from './members.fixture.js';

/**
 * Lot 3.4 · étape 1, cas absents du jeu de référence : seuls les paiements validés comptent ; le versé est le montant
 * reçu (pas le déclaré) et suit la vue gestionnaire (en.list) jusqu'à l'annulation d'une validation ; la période porte
 * sur la date de virement, pas sur la date de déclaration ; deux déclarations à la même seconde sont départagées par
 * identifiant, sans doublon ni oubli entre deux pages.
 * Heure réelle (fenêtre d'annulation de 10 min comptée sur `now()` de la base) ; les attendus ne dépendent pas du jour.
 * PROJECTS.a : 25 000 F le 5 de chaque mois, de mars 2026 à août 2027 (18 échéances).
 */

const History = ENDPOINTS['me.history'].operations.list.response.body;
const Series = ENDPOINTS['me.history'].operations.series.response.body;
const Enrollments = ENDPOINTS['en.list'].operations.list.response.body;
const XOF = (amount: number) => ({ amount, currency: 'XOF' });

describe('me.history : statuts, montant reçu, annulation, date de virement', () => {
  let f: LedgerFixture;

  const historyOf = async (query = '?limit=100') => {
    const res = await f.call(`/me/history${query}`, { token: f.tokens.moussa });
    expect(res.status).toBe(200);
    return History.parse(await res.json());
  };
  const seriesOf = async (query = '') => {
    const res = await f.call(`/me/history/series${query}`, { token: f.tokens.moussa });
    expect(res.status).toBe(200);
    return Series.parse(await res.json());
  };
  /** Versé de Moussa sur PROJECTS.a tel que le voit la trésorière (en.list). */
  const managerPaid = async () => {
    const res = await f.call(`/associations/${A.id}/projects/${PROJECTS.a}/enrollments?limit=100`, {
      token: f.tokens.awa,
    });
    expect(res.status).toBe(200);
    return Enrollments.parse(await res.json()).items.find((e) => e.member.id === USERS.moussa)?.paid;
  };
  const review = (payId: string, action: 'validate' | 'revert-validation', body: unknown, version?: number) =>
    f.call(`/associations/${A.id}/payments/${payId}/${action}`, {
      token: f.tokens.awa,
      method: 'POST',
      body,
      headers: {
        'idempotency-key': crypto.randomUUID(),
        ...(version === undefined ? {} : { 'if-match': `W/"${String(version)}"` }),
      },
    });
  const enrolled = () => f.enrollByApi({ userId: USERS.moussa, startsFrom: '2026-03-01' });

  beforeAll(async () => {
    f = await startLedgerFixture();
  });
  afterAll(async () => {
    await f.stop();
  });
  beforeEach(async () => {
    await f.resetLedger();
  });

  it('en attente et rejeté : listés, jamais comptés ; validé à 25 000 F reçus sur 30 000 F déclarés, puis annulé', async () => {
    const e = await enrolled();
    const march = await f.installmentOf(e.id, '2026-03-05');
    const april = await f.installmentOf(e.id, '2026-04-05');
    const may = await f.installmentOf(e.id, '2026-05-05');
    const main = await f.record({
      enrollmentId: e.id,
      userId: USERS.moussa,
      amount: 30000,
      status: 'pending',
      declaredAt: '2026-11-06T09:00:00Z',
      lines: [
        { installmentId: march, amount: 25000, state: 'proposed' },
        { installmentId: april, amount: 5000, state: 'proposed' },
      ],
    });
    await f.record({
      enrollmentId: e.id,
      userId: USERS.moussa,
      amount: 20000,
      status: 'rejected',
      declaredAt: '2026-11-01T09:00:00Z',
      reviewedBy: USERS.awa,
      reviewedAt: '2026-11-02T09:00:00Z',
      rejection: { code: 'not_received', message: null },
      lines: [{ installmentId: may, amount: 20000, state: 'voided' }],
    });

    const before = await historyOf();
    expect(before.total).toBe(2);
    expect(before.summary).toEqual({ totalPaid: XOF(0), paymentsCount: 0, remaining: XOF(18 * 25000) });
    expect((await seriesOf()).cumulative).toEqual([]);

    // Reçu 25 000 F seulement : le versé est le reçu, comme la vue gestionnaire.
    const validated = await review(
      main,
      'validate',
      { amountReceived: XOF(25000), allocations: [{ installmentId: march, amount: XOF(25000) }] },
      1,
    );
    expect([validated.status, validated.status === 200 ? null : await validated.text()]).toEqual([200, null]);
    const after = await historyOf();
    expect(after.total).toBe(2);
    expect(after.summary).toEqual({ totalPaid: XOF(25000), paymentsCount: 1, remaining: XOF(18 * 25000 - 25000) });
    expect(await managerPaid()).toEqual(after.summary.totalPaid);
    expect(after.items.find((p) => p.id === main)).toMatchObject({
      status: 'validated',
      amountDeclared: XOF(30000),
      amountReceived: XOF(25000),
    });
    expect((await seriesOf()).cumulative).toEqual([{ month: '2026-11-01', paid: XOF(25000) }]);

    // Annulation de la validation : le paiement repart en attente, plus rien n'est versé (ni ici, ni pour la trésorière).
    const revert = await review(main, 'revert-validation', {});
    expect([revert.status, revert.status === 200 ? null : await revert.text()]).toEqual([200, null]);
    const reverted = await historyOf();
    expect(reverted.items.find((p) => p.id === main)?.status).toBe('pending');
    expect(reverted.summary).toEqual({ totalPaid: XOF(0), paymentsCount: 0, remaining: XOF(18 * 25000) });
    expect(await managerPaid()).toEqual(XOF(0));
    expect((await seriesOf()).cumulative).toEqual([]);
  });

  it('période sur la date de virement : déclaré en octobre pour un virement de septembre, et l’inverse', async () => {
    const e = await enrolled();
    const march = await f.installmentOf(e.id, '2026-03-05');
    const april = await f.installmentOf(e.id, '2026-04-05');
    /**
     * Validé, déclaré à `declaredAt`, virement du `paidOn`. La base interdit de changer `paid_on` après la déclaration
     * (guard_payment_update) et la fixture le prend du jour de déclaration : posé ici déclencheurs suspendus.
     */
    const validated = async (installmentId: string, declaredAt: string, paidOn: string) => {
      const id = await f.record({
        enrollmentId: e.id,
        userId: USERS.moussa,
        amount: 25000,
        status: 'validated',
        declaredAt,
        reviewedBy: USERS.awa,
        reviewedAt: declaredAt,
        lines: [{ installmentId, amount: 25000, state: 'confirmed' }],
      });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      expect(paidOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await f.h.superuser(
        `BEGIN; SET LOCAL session_replication_role = replica;
         UPDATE payments SET paid_on = '${paidOn}' WHERE id = '${id}'; COMMIT;`,
      );
      return id;
    };
    const septemberTransfer = await validated(march, '2026-10-01T09:00:00Z', '2026-09-15');
    const octoberTransfer = await validated(april, '2026-09-20T09:00:00Z', '2026-10-02');

    const september = await historyOf('?from=2026-09-01&to=2026-09-30');
    expect(september.items.map((p) => p.id)).toEqual([septemberTransfer]);
    expect(september.summary).toMatchObject({ totalPaid: XOF(25000), paymentsCount: 1 });
    const october = await historyOf('?from=2026-10-01&to=2026-10-31');
    expect(october.items.map((p) => p.id)).toEqual([octoberTransfer]);

    expect((await seriesOf()).byMonth).toEqual([
      { month: '2026-09-01', projects: [{ projectId: PROJECTS.a, paid: XOF(25000) }] },
      { month: '2026-10-01', projects: [{ projectId: PROJECTS.a, paid: XOF(25000) }] },
    ]);
    expect((await seriesOf('?from=2026-09-01&to=2026-09-30')).cumulative).toEqual([
      { month: '2026-09-01', paid: XOF(25000) },
    ]);
  });

  it('même seconde de déclaration : identifiant décroissant, une page chacun, sans doublon', async () => {
    const e = await enrolled();
    const march = await f.installmentOf(e.id, '2026-03-05');
    const april = await f.installmentOf(e.id, '2026-04-05');
    const may = await f.installmentOf(e.id, '2026-05-05');
    const ids: string[] = [];
    for (const installmentId of [march, april, may]) {
      ids.push(
        await f.record({
          enrollmentId: e.id,
          userId: USERS.moussa,
          amount: 25000,
          status: 'pending',
          declaredAt: '2026-11-07T09:00:00Z',
          lines: [{ installmentId, amount: 25000, state: 'proposed' }],
        }),
      );
    }
    const expected = [...ids].sort().reverse();
    expect((await historyOf()).items.map((p) => p.id)).toEqual(expected);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof historyOf>> = await historyOf(
        `?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
      );
      expect(page.items).toHaveLength(1);
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(expected);
  });
});
