import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  collectionBySequence,
  collectionFigures,
  collectionProgress,
  DomainError,
  type CollectionInstallment,
  inCollectionPeriod,
  monthlyCollection,
  nextDueDate,
  recentMonths,
  recoveryRateBySequence,
} from './index.js';
import type { InstallmentStatus } from './index.js';

const TODAY = '2026-09-25';

const line = (
  sequence: number,
  dueDate: string,
  amountDue: number,
  amountPaid: number,
  status: InstallmentStatus,
  kind: 'entry_fee' | 'periodic' = 'periodic',
): CollectionInstallment => ({ kind, sequence, dueDate, amountDue, amountPaid, status });

describe('collectionFigures : attendu, encaissé et recouvrement d’un ensemble d’échéances', () => {
  it('attendu à date = échéances échues ; encaissé = tout le versé, anticipé compris', () => {
    const figures = collectionFigures(
      [
        line(0, '2026-08-05', 50_000, 50_000, 'paid', 'entry_fee'),
        line(1, '2026-08-05', 25_000, 25_000, 'paid'),
        line(2, '2026-09-05', 25_000, 10_000, 'late'),
        line(3, '2026-10-05', 25_000, 25_000, 'paid'),
      ],
      TODAY,
    );
    expect(figures).toEqual({
      expectedToDate: 100_000,
      recoveredToDate: 85_000,
      received: 110_000,
      remainingToDate: 15_000,
      lateCount: 1,
      lateAmount: 15_000,
      recoveryRate: 0.85,
    });
  });

  it('une échéance due aujourd’hui est attendue', () => {
    expect(collectionFigures([line(1, TODAY, 25_000, 0, 'due')], TODAY).expectedToDate).toBe(25_000);
  });

  it('échéances annulées ou dispensées : plus attendues, mais leur versé reste encaissé', () => {
    const figures = collectionFigures(
      [line(1, '2026-08-05', 25_000, 5_000, 'canceled'), line(2, '2026-09-05', 25_000, 0, 'waived')],
      TODAY,
    );
    expect(figures).toMatchObject({ expectedToDate: 0, received: 5_000, recoveredToDate: 0, recoveryRate: null });
  });

  it('période : bornes facultatives et comprises', () => {
    expect(inCollectionPeriod('2026-03-05')).toBe(true);
    expect(inCollectionPeriod('2026-03-05', { from: '2026-03-05', to: '2026-03-05' })).toBe(true);
    expect(inCollectionPeriod('2026-03-04', { from: '2026-03-05' })).toBe(false);
    expect(inCollectionPeriod('2026-03-06', { to: '2026-03-05' })).toBe(false);
  });

  it('rien d’attendu : taux null ; versement anticipé seul : encaissé sans recouvrement', () => {
    const figures = collectionFigures([line(1, '2026-10-05', 25_000, 25_000, 'paid')], TODAY);
    expect(figures).toMatchObject({ expectedToDate: 0, received: 25_000, recoveryRate: null, remainingToDate: 0 });
  });

  it('montant invalide ou versé supérieur au dû : refusé', () => {
    expect(() => collectionFigures([line(1, TODAY, 25_000, 30_000, 'paid')], TODAY)).toThrow(DomainError);
    expect(() => collectionFigures([line(1, TODAY, -1, 0, 'due')], TODAY)).toThrow(DomainError);
    expect(() => collectionFigures([line(1, TODAY, 1.5, 0, 'due')], TODAY)).toThrow(DomainError);
  });

  it('propriétés : recouvré ≤ encaissé, reste = attendu − recouvré ≥ 0, taux dans [0, 1]', () => {
    const statuses: InstallmentStatus[] = [
      'upcoming',
      'due',
      'declared',
      'partial',
      'paid',
      'late',
      'waived',
      'canceled',
    ];
    const arb = fc.array(
      fc
        .record({
          day: fc.integer({ min: 1, max: 28 }),
          month: fc.integer({ min: 1, max: 12 }),
          due: fc.integer({ min: 0, max: 1_000_000 }),
          status: fc.constantFrom(...statuses),
        })
        .chain(({ day, month, due, status }) =>
          fc.integer({ min: 0, max: due }).map((paid) => {
            const dueDate = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            // Comme installmentStatus : une échéance en retard est échue.
            return line(month, dueDate, due, paid, status === 'late' && dueDate > TODAY ? 'upcoming' : status);
          }),
        ),
      { maxLength: 40 },
    );
    fc.assert(
      fc.property(arb, (lines) => {
        const f = collectionFigures(lines, TODAY);
        expect(f.received).toBe(lines.reduce((sum, l) => sum + l.amountPaid, 0));
        expect(f.recoveredToDate).toBeLessThanOrEqual(f.received);
        expect(f.recoveredToDate).toBeLessThanOrEqual(f.expectedToDate);
        expect(f.remainingToDate).toBe(f.expectedToDate - f.recoveredToDate);
        expect(f.lateAmount).toBeLessThanOrEqual(f.remainingToDate);
        if (f.recoveryRate !== null) {
          expect(f.recoveryRate).toBeGreaterThanOrEqual(0);
          expect(f.recoveryRate).toBeLessThanOrEqual(1);
        } else expect(f.expectedToDate).toBe(0);
      }),
    );
  });
});

describe('collectionBySequence : attendu et encaissé par échéance périodique', () => {
  it('regroupe par rang, hors fonds d’entrée et échéances annulées, dans l’ordre des rangs', () => {
    expect(
      collectionBySequence([
        line(2, '2026-09-05', 25_000, 0, 'late'),
        line(0, '2026-08-05', 50_000, 50_000, 'paid', 'entry_fee'),
        line(1, '2026-08-05', 25_000, 25_000, 'paid'),
        line(1, '2026-08-05', 25_000, 12_500, 'late'),
        line(2, '2026-09-05', 25_000, 25_000, 'paid'),
        line(2, '2026-09-05', 25_000, 0, 'canceled'),
      ]),
    ).toEqual([
      { sequence: 1, dueDate: '2026-08-05', expected: 50_000, received: 37_500 },
      { sequence: 2, dueDate: '2026-09-05', expected: 50_000, received: 25_000 },
    ]);
  });

  it('cycle roulant : date d’échéance la plus ancienne du rang', () => {
    expect(
      collectionBySequence([line(1, '2026-09-05', 10_000, 0, 'late'), line(1, '2026-08-05', 10_000, 0, 'late')]),
    ).toEqual([{ sequence: 1, dueDate: '2026-08-05', expected: 20_000, received: 0 }]);
  });
});

describe('recoveryRateBySequence : taux cumulé après chaque échéance échue', () => {
  it('une valeur par date d’échéance périodique échue, fonds d’entrée compris dans le cumul', () => {
    const lines = [
      line(0, '2026-08-05', 50_000, 50_000, 'paid', 'entry_fee'),
      line(1, '2026-08-05', 25_000, 0, 'late'),
      line(2, '2026-09-05', 25_000, 25_000, 'paid'),
      line(3, '2026-10-05', 25_000, 25_000, 'paid'),
    ];
    expect(recoveryRateBySequence(lines, TODAY)).toEqual([
      { dueDate: '2026-08-05', rate: 50_000 / 75_000 },
      { dueDate: '2026-09-05', rate: 0.75 },
    ]);
  });

  it('le dernier point est le taux de recouvrement du jour quand tout l’attendu est périodique', () => {
    const lines = [line(1, '2026-08-05', 25_000, 20_000, 'late'), line(2, '2026-09-05', 25_000, 25_000, 'paid')];
    expect(recoveryRateBySequence(lines, TODAY).at(-1)?.rate).toBe(collectionFigures(lines, TODAY).recoveryRate);
  });

  it('plusieurs échéances à la même date, date de fonds d’entrée seule, échéance annulée : un point par date périodique', () => {
    const lines = [
      line(1, '2026-09-05', 10_000, 0, 'late'),
      line(0, '2026-07-20', 20_000, 20_000, 'paid', 'entry_fee'),
      line(1, '2026-08-05', 10_000, 10_000, 'paid'),
      line(2, '2026-09-05', 10_000, 10_000, 'paid'),
      line(2, '2026-08-05', 10_000, 0, 'canceled'),
    ];
    expect(recoveryRateBySequence(lines, TODAY)).toEqual([
      { dueDate: '2026-08-05', rate: 1 },
      { dueDate: '2026-09-05', rate: 40_000 / 50_000 },
    ]);
  });

  it('aucune échéance échue : liste vide', () => {
    expect(recoveryRateBySequence([line(1, '2026-10-05', 25_000, 0, 'upcoming')], TODAY)).toEqual([]);
  });
});

describe('recentMonths : premiers jours des derniers mois, le dernier est le mois du jour', () => {
  it('6 mois jusqu’à septembre, à cheval sur une année', () => {
    expect(recentMonths('2026-09-25', 6)).toEqual([
      '2026-04-01',
      '2026-05-01',
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ]);
    expect(recentMonths('2027-02-28', 3)).toEqual(['2026-12-01', '2027-01-01', '2027-02-01']);
  });

  it('refuse un nombre de mois non entier ou inférieur à 1', () => {
    expect(() => recentMonths(TODAY, 0)).toThrow(DomainError);
    expect(() => recentMonths(TODAY, 1.5)).toThrow(DomainError);
  });
});

describe('monthlyCollection : attendu (échéances du mois) et reçu (validé dans le mois) par mois', () => {
  const months = ['2026-08-01', '2026-09-01'];

  it('attendu = dû des échéances datées du mois qui comptent ; reçu = Σ des montants reçus du mois', () => {
    const result = monthlyCollection(
      [
        line(0, '2026-08-05', 50_000, 50_000, 'paid', 'entry_fee'),
        line(1, '2026-08-05', 25_000, 25_000, 'paid'),
        line(2, '2026-09-05', 25_000, 0, 'late'),
        line(3, '2026-09-05', 25_000, 0, 'canceled'),
        line(4, '2026-10-05', 25_000, 25_000, 'paid'),
        line(5, '2026-07-05', 25_000, 0, 'waived'),
      ],
      [
        { month: '2026-08-01', amount: 50_000 },
        { month: '2026-08-01', amount: 25_000 },
        { month: '2026-09-01', amount: 25_000 },
        { month: '2026-07-01', amount: 99_000 },
      ],
      months,
    );
    expect(result).toEqual([
      { month: '2026-08-01', expected: 75_000, received: 75_000 },
      { month: '2026-09-01', expected: 25_000, received: 25_000 },
    ]);
  });

  it('un mois sans rien : 0 et 0', () => {
    expect(monthlyCollection([], [], months)).toEqual([
      { month: '2026-08-01', expected: 0, received: 0 },
      { month: '2026-09-01', expected: 0, received: 0 },
    ]);
  });

  it('refuse un montant reçu négatif ou non entier, et un mois qui n’est pas un premier du mois', () => {
    expect(() => monthlyCollection([], [{ month: '2026-08-01', amount: -1 }], months)).toThrow(DomainError);
    expect(() => monthlyCollection([], [{ month: '2026-08-01', amount: 0.5 }], months)).toThrow(DomainError);
    expect(() => monthlyCollection([], [], ['2026-08-05'])).toThrow(DomainError);
  });

  it('propriété : la somme des attendus mensuels = dû des échéances qui comptent dans ces mois', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            day: fc.integer({ min: 1, max: 28 }),
            month: fc.constantFrom('08', '09'),
            due: fc.integer({ min: 0, max: 1_000_000 }),
            status: fc.constantFrom<InstallmentStatus>('upcoming', 'due', 'late', 'paid', 'canceled', 'waived'),
          }),
        ),
        (rows) => {
          const lines = rows.map((r, k) =>
            line(k + 1, `2026-${r.month}-${String(r.day).padStart(2, '0')}`, r.due, 0, r.status),
          );
          const total = monthlyCollection(lines, [], months).reduce((s, m) => s + m.expected, 0);
          const expected = lines
            .filter((l) => l.status !== 'canceled' && l.status !== 'waived')
            .reduce((s, l) => s + l.amountDue, 0);
          expect(total).toBe(expected);
        },
      ),
    );
  });
});

describe('collectionProgress : avancement d’un projet', () => {
  it('en inscription : souscripteurs / souscripteurs requis, plafonné à 1 ; sans objectif : null', () => {
    const base = { received: 0, totalPerSubscriber: null };
    expect(collectionProgress({ ...base, status: 'enrolling', subscribersCount: 12, requiredSubscribers: 30 })).toBe(
      0.4,
    );
    expect(collectionProgress({ ...base, status: 'enrolling', subscribersCount: 40, requiredSubscribers: 30 })).toBe(1);
    expect(
      collectionProgress({ ...base, status: 'enrolling', subscribersCount: 3, requiredSubscribers: null }),
    ).toBeNull();
  });

  it('sinon : encaissé / (souscripteurs × engagement par souscripteur), plafonné à 1 ; cycle roulant ou vide : null', () => {
    const base = { status: 'active' as const, requiredSubscribers: null };
    expect(collectionProgress({ ...base, subscribersCount: 2, received: 250_000, totalPerSubscriber: 500_000 })).toBe(
      0.25,
    );
    expect(collectionProgress({ ...base, subscribersCount: 1, received: 600_000, totalPerSubscriber: 500_000 })).toBe(
      1,
    );
    expect(collectionProgress({ ...base, subscribersCount: 0, received: 0, totalPerSubscriber: 500_000 })).toBeNull();
    expect(collectionProgress({ ...base, subscribersCount: 4, received: 10_000, totalPerSubscriber: null })).toBeNull();
  });

  it('refuse un encaissé ou un nombre de souscripteurs invalides', () => {
    const base = { status: 'active' as const, requiredSubscribers: null, totalPerSubscriber: 500_000 };
    expect(() => collectionProgress({ ...base, subscribersCount: 1, received: -1 })).toThrow(DomainError);
    expect(() => collectionProgress({ ...base, subscribersCount: 1.5, received: 0 })).toThrow(DomainError);
  });
});

describe('nextDueDate : prochaine date d’échéance après le jour donné', () => {
  it('la plus proche des échéances futures qui comptent ; aucune : null', () => {
    expect(
      nextDueDate(
        [
          line(1, '2026-09-05', 25_000, 0, 'late'),
          line(2, '2026-10-05', 25_000, 0, 'canceled'),
          line(3, '2026-11-05', 25_000, 0, 'upcoming'),
          line(4, '2026-12-05', 25_000, 0, 'upcoming'),
        ],
        TODAY,
      ),
    ).toBe('2026-11-05');
    expect(
      nextDueDate([line(1, '2026-09-25', 25_000, 0, 'due'), line(2, '2026-10-05', 0, 0, 'waived')], TODAY),
    ).toBeNull();
  });
});

describe('collectionProgress : entrées invalides', () => {
  it('refuse un nombre requis ou un engagement non entier, nul ou négatif', () => {
    const base = { subscribersCount: 1, received: 0 };
    expect(() =>
      collectionProgress({ ...base, status: 'enrolling', requiredSubscribers: -3, totalPerSubscriber: null }),
    ).toThrow(DomainError);
    expect(() =>
      collectionProgress({ ...base, status: 'active', requiredSubscribers: null, totalPerSubscriber: 0.5 }),
    ).toThrow(DomainError);
  });
});

describe('monthlyCollection : propriété du reçu', () => {
  it('Σ des reçus mensuels = Σ des montants reçus des mois couverts', () => {
    const months = ['2026-08-01', '2026-09-01'];
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            month: fc.constantFrom('2026-07-01', '2026-08-01', '2026-09-01'),
            amount: fc.integer({ min: 0, max: 1_000_000 }),
          }),
        ),
        (receipts) => {
          const total = monthlyCollection([], receipts, months).reduce((s, m) => s + m.received, 0);
          const expected = receipts.filter((r) => months.includes(r.month)).reduce((s, r) => s + r.amount, 0);
          expect(total).toBe(expected);
        },
      ),
    );
  });
});
