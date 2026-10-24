import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, Money, monthlyEquivalent, monthlyRecurringRevenue } from './index.js';
import type { BillingPeriod, Currency, RecurringRevenueLine } from './index.js';

function code(fn: () => unknown): string | undefined {
  try {
    fn();
    return undefined;
  } catch (e) {
    if (e instanceof DomainError) return e.code;
    throw e;
  }
}

describe('monthlyEquivalent', () => {
  it('prix mensuel : inchangé', () => {
    expect(monthlyEquivalent(Money.of(15000, 'XOF'), 'monthly')).toEqual(Money.of(15000, 'XOF'));
  });

  it('prix annuel : divisé par 12, arrondi à l’entier inférieur', () => {
    expect(monthlyEquivalent(Money.of(150000, 'XOF'), 'yearly')).toEqual(Money.of(12500, 'XOF'));
    expect(monthlyEquivalent(Money.of(100000, 'XOF'), 'yearly')).toEqual(Money.of(8333, 'XOF'));
    expect(monthlyEquivalent(Money.of(11, 'XOF'), 'yearly')).toEqual(Money.of(0, 'XOF'));
    expect(monthlyEquivalent(Money.of(0, 'XAF'), 'yearly')).toEqual(Money.of(0, 'XAF'));
  });

  it('garde la devise', () => {
    expect(monthlyEquivalent(Money.of(120000, 'GNF'), 'yearly')).toEqual(Money.of(10000, 'GNF'));
  });

  it('refuse un prix négatif, une période inconnue, un montant invalide', () => {
    expect(code(() => monthlyEquivalent(Money.of(-12, 'XOF'), 'yearly'))).toBe('invalid_amount');
    expect(code(() => monthlyEquivalent(Money.of(12, 'XOF'), 'weekly' as BillingPeriod))).toBe(
      'invalid_billing_period',
    );
    expect(code(() => monthlyEquivalent({ amount: 1.5, currency: 'XOF' }, 'monthly'))).toBe('invalid_amount');
  });

  it('propriété : 12 × équivalent ≤ prix annuel < 12 × (équivalent + 1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }), (amount) => {
        const { amount: m } = monthlyEquivalent(Money.of(amount, 'XOF'), 'yearly');
        expect(Number.isSafeInteger(m)).toBe(true);
        expect(BigInt(m) * 12n <= BigInt(amount)).toBe(true);
        expect(BigInt(amount) < (BigInt(m) + 1n) * 12n).toBe(true);
      }),
    );
  });
});

describe('monthlyRecurringRevenue', () => {
  const line = (amount: number, billingPeriod: BillingPeriod, count: number, currency: Currency = 'XOF') => ({
    price: Money.of(amount, currency),
    billingPeriod,
    count,
  });

  it('aucune ligne : zéro dans la devise demandée', () => {
    expect(monthlyRecurringRevenue([], 'XOF')).toEqual(Money.zero('XOF'));
  });

  it('somme des équivalents mensuels, chacun arrondi avant multiplication', () => {
    // 3 × 15 000 + 2 × ⌊100 000 / 12⌋ = 45 000 + 2 × 8 333 = 61 666 (et non ⌊45 000 + 200 000 / 12⌋ = 61 666,67).
    expect(monthlyRecurringRevenue([line(15000, 'monthly', 3), line(100000, 'yearly', 2)], 'XOF')).toEqual(
      Money.of(61666, 'XOF'),
    );
  });

  it('une ligne sans abonnement ne compte pas', () => {
    expect(monthlyRecurringRevenue([line(15000, 'monthly', 0)], 'XOF')).toEqual(Money.zero('XOF'));
  });

  it('refuse un nombre négatif ou non entier, une autre devise, un total hors des entiers sûrs', () => {
    expect(code(() => monthlyRecurringRevenue([line(1000, 'monthly', -1)], 'XOF'))).toBe('invalid_amount');
    expect(code(() => monthlyRecurringRevenue([line(1000, 'monthly', 1.5)], 'XOF'))).toBe('invalid_amount');
    expect(code(() => monthlyRecurringRevenue([line(1000, 'monthly', 1, 'XAF')], 'XOF'))).toBe('currency_mismatch');
    expect(code(() => monthlyRecurringRevenue([line(Number.MAX_SAFE_INTEGER, 'monthly', 2)], 'XOF'))).toBe(
      'invalid_amount',
    );
  });

  it('propriété : égal à la somme ligne par ligne, indépendant de l’ordre', () => {
    const lines = fc.array(
      fc.record({
        amount: fc.integer({ min: 0, max: 10_000_000 }),
        billingPeriod: fc.constantFrom<BillingPeriod>('monthly', 'yearly'),
        count: fc.integer({ min: 0, max: 10_000 }),
      }),
      { maxLength: 20 },
    );
    fc.assert(
      fc.property(lines, (raw) => {
        const input: RecurringRevenueLine[] = raw.map((r) => line(r.amount, r.billingPeriod, r.count));
        const expected = raw.reduce(
          (t, r) => t + (r.billingPeriod === 'monthly' ? r.amount : Math.floor(r.amount / 12)) * r.count,
          0,
        );
        expect(monthlyRecurringRevenue(input, 'XOF')).toEqual(Money.of(expected, 'XOF'));
        expect(monthlyRecurringRevenue([...input].reverse(), 'XOF')).toEqual(Money.of(expected, 'XOF'));
      }),
    );
  });
});
