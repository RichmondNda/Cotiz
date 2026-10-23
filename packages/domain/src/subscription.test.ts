import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, firstSubscriptionPeriod, periodEnd } from './index.js';
import type { FirstPeriod, FirstPeriodInput } from './index.js';
import { addDays } from './dates.js';
import { loadVectors } from './test-vectors.js';

interface SubscriptionCase {
  name: string;
  input: FirstPeriodInput;
  output?: FirstPeriod;
  error?: { code: string };
}
const vectors = loadVectors<SubscriptionCase>('subscription');

function run(input: FirstPeriodInput): FirstPeriod | { code: string } {
  try {
    return firstSubscriptionPeriod(input);
  } catch (e) {
    if (e instanceof DomainError) return { code: e.code };
    throw e;
  }
}

describe('firstSubscriptionPeriod — vecteurs docs/specs/test-vectors/subscription.json', () => {
  it.each(vectors.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(run(c.input)).toEqual(c.output ?? c.error);
  });
});

const day = fc
  .record({
    year: fc.integer({ min: 1900, max: 2199 }),
    month: fc.integer({ min: 1, max: 12 }),
    day: fc.integer({ min: 1, max: 28 }),
  })
  .map(({ year, month, day: d }) => `${String(year)}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
const anyDay = fc.tuple(day, fc.integer({ min: 0, max: 3 })).map(([d, extra]) => addDays(d, extra));
const period = fc.constantFrom('monthly' as const, 'yearly' as const);

describe('periodEnd — propriétés', () => {
  it('la fin suit le début ; un mois dure 28 à 31 jours, un an 365 ou 366', () => {
    fc.assert(
      fc.property(anyDay, period, (start, p) => {
        const end = periodEnd(start, p);
        expect(end >= start).toBe(true);
        const length = (Date.parse(end) - Date.parse(start)) / 86_400_000 + 1;
        if (p === 'monthly') expect(length).toBeGreaterThanOrEqual(28);
        if (p === 'monthly') expect(length).toBeLessThanOrEqual(31);
        if (p === 'yearly') expect([365, 366]).toContain(length);
      }),
    );
  });

  it('jusqu’au 28 : la période suivante reprend le même jour du mois', () => {
    fc.assert(
      fc.property(day, period, (start, p) => {
        expect(addDays(periodEnd(start, p), 1).slice(8)).toBe(start.slice(8));
      }),
    );
  });
});

describe('firstSubscriptionPeriod — propriétés', () => {
  it('essai : la période en cours est l’essai, de la durée demandée', () => {
    fc.assert(
      fc.property(anyDay, period, fc.integer({ min: 1, max: 365 }), (startsOn, billingPeriod, trialDays) => {
        const first = firstSubscriptionPeriod({ startsOn, billingPeriod, trialDays });
        expect(first.status).toBe('trialing');
        expect(first.currentPeriodEnd).toBe(first.trialEndsAt);
        expect(addDays(startsOn, trialDays - 1)).toBe(first.trialEndsAt);
      }),
    );
  });
});
