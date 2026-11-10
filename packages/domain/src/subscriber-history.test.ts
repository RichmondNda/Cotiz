import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, subscriberHistoryFigures, type HistoryPayment } from './index.js';

const P1 = 'p1';
const P2 = 'p2';
const pay = (paidOn: string, amount: number, projectId = P1): HistoryPayment => ({ paidOn, amount, projectId });

describe('subscriberHistoryFigures : historique du souscripteur (me.history)', () => {
  it('période (`from`) : le cumul part des versements antérieurs ; versé, nombre et mois : la période seule', () => {
    const payments = [pay('2026-06-02', 5_000), pay('2026-07-30', 50_000, P2), pay('2026-08-05', 25_000)];
    const f = subscriberHistoryFigures(payments, [], { from: '2026-07-15' });
    expect(f.totalPaid).toBe(75_000);
    expect(f.paymentsCount).toBe(2);
    // Juin (avant la période) n'est pas un mois de la courbe, mais son versé est dans le cumul.
    expect(f.cumulative).toEqual([
      { month: '2026-07-01', paid: 55_000 },
      { month: '2026-08-01', paid: 80_000 },
    ]);
    expect(f.byMonth).toEqual([
      { month: '2026-07-01', projects: [{ projectId: P2, paid: 50_000 }] },
      { month: '2026-08-01', projects: [{ projectId: P1, paid: 25_000 }] },
    ]);
    // Sans `from` : tout compte.
    expect(subscriberHistoryFigures(payments, []).cumulative.at(-1)?.paid).toBe(80_000);
    expect(() => subscriberHistoryFigures(payments, [], { from: '2026-13-01' })).toThrow(DomainError);
  });

  it('total versé et nombre de paiements validés ; cumul et versé par mois de la date de virement', () => {
    const f = subscriberHistoryFigures(
      // Août : P2 reçu avant P1, rendu trié par projet.
      [
        pay('2026-08-20', 10_000, P2),
        pay('2026-07-30', 50_000, P2),
        pay('2026-08-05', 25_000),
        pay('2026-06-02', 5_000),
      ],
      [],
    );
    expect(f.totalPaid).toBe(90_000);
    expect(f.paymentsCount).toBe(4);
    expect(f.cumulative).toEqual([
      { month: '2026-06-01', paid: 5_000 },
      { month: '2026-07-01', paid: 55_000 },
      { month: '2026-08-01', paid: 90_000 },
    ]);
    expect(f.byMonth).toEqual([
      { month: '2026-06-01', projects: [{ projectId: P1, paid: 5_000 }] },
      { month: '2026-07-01', projects: [{ projectId: P2, paid: 50_000 }] },
      {
        month: '2026-08-01',
        projects: [
          { projectId: P1, paid: 25_000 },
          { projectId: P2, paid: 10_000 },
        ],
      },
    ]);
  });

  it('aucun paiement : zéros et séries vides', () => {
    const f = subscriberHistoryFigures([], []);
    expect(f).toEqual({ totalPaid: 0, paymentsCount: 0, cumulative: [], byMonth: [], target: null });
  });

  it('objectif : engagements des inscriptions qui engagent (active, terminée) ; ouvert ou aucune → null', () => {
    expect(
      subscriberHistoryFigures(
        [],
        [
          { status: 'active', commitment: 300_000 },
          { status: 'completed', commitment: 100_000 },
          { status: 'pending_signature', commitment: 999_000 },
          { status: 'withdrawn', commitment: null },
        ],
      ).target,
    ).toBe(400_000);
    expect(
      subscriberHistoryFigures(
        [],
        [
          { status: 'active', commitment: 300_000 },
          { status: 'active', commitment: null },
        ],
      ).target,
    ).toBeNull();
    expect(subscriberHistoryFigures([], [{ status: 'pending_signature', commitment: 50_000 }]).target).toBeNull();
  });

  it('montant non entier, négatif ou somme hors des entiers sûrs → invalid_amount ; date illisible refusée', () => {
    expect(() => subscriberHistoryFigures([pay('2026-08-05', 1.5)], [])).toThrow(DomainError);
    expect(() => subscriberHistoryFigures([pay('2026-08-05', -1)], [])).toThrow(DomainError);
    expect(() =>
      subscriberHistoryFigures([pay('2026-08-05', Number.MAX_SAFE_INTEGER), pay('2026-08-06', 1)], []),
    ).toThrow(DomainError);
    expect(() => subscriberHistoryFigures([], [{ status: 'active', commitment: -5 }])).toThrow(DomainError);
    expect(() => subscriberHistoryFigures([pay('2026-13-05', 1)], [])).toThrow();
  });

  it('propriétés : dernier cumul = total = Σ des mois ; cumul croissant ; mois triés et distincts', () => {
    const payment = fc.record({
      paidOn: fc
        .date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2030-12-31T00:00:00Z'), noInvalidDate: true })
        .map((d) => d.toISOString().slice(0, 10)),
      amount: fc.integer({ min: 0, max: 10_000_000 }),
      projectId: fc.constantFrom(P1, P2, 'p3'),
    });
    fc.assert(
      fc.property(fc.array(payment, { maxLength: 40 }), (payments) => {
        const f = subscriberHistoryFigures(payments, []);
        const sum = payments.reduce((t, p) => t + p.amount, 0);
        expect(f.totalPaid).toBe(sum);
        expect(f.paymentsCount).toBe(payments.length);
        expect(f.cumulative.at(-1)?.paid ?? 0).toBe(sum);
        const byMonthSum = f.byMonth.flatMap((m) => m.projects).reduce((t, p) => t + p.paid, 0);
        expect(byMonthSum).toBe(sum);
        const months = f.cumulative.map((c) => c.month);
        expect(months).toEqual([...new Set(months)].sort());
        expect(f.byMonth.map((m) => m.month)).toEqual(months);
        for (const m of f.byMonth) {
          const ids = m.projects.map((p) => p.projectId);
          expect(ids).toEqual([...new Set(ids)].sort());
        }
        f.cumulative.forEach((c, i) => {
          expect(c.paid).toBeGreaterThanOrEqual(f.cumulative[i - 1]?.paid ?? 0);
        });
      }),
    );
  });
});
