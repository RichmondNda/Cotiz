import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  collectionBySequence,
  collectionFigures,
  DomainError,
  type CollectionInstallment,
  inCollectionPeriod,
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
