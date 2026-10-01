import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, formatMoney, Money } from './index.js';
import type { Currency } from './index.js';
import { loadVectors } from './test-vectors.js';

interface MoneyCase {
  input: { amount: number; currency: Currency };
  output: string;
}
const vectors = loadVectors<MoneyCase>('money');

describe('formatMoney — vecteurs money.json', () => {
  it('le fichier décrit formatMoney', () => {
    expect(vectors.function).toBe('formatMoney');
    expect(vectors.cases.length).toBeGreaterThan(0);
  });

  it.each(vectors.cases.map((c) => [c.output, c] as const))('%s', (_label, c) => {
    expect(formatMoney(c.input.amount, c.input.currency)).toBe(c.output);
  });

  it('accepte un Money', () => {
    expect(formatMoney(Money.of(25000, 'XOF'))).toBe('25\u202f000\u00a0F');
    expect(formatMoney(Money.of(25000, 'XAF'))).toBe('25\u202f000\u00a0F');
  });

  it.each([2500.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'refuse le montant %s (invalid_amount)',
    (amount) => {
      expect(() => formatMoney(amount, 'XOF')).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    },
  );

  it('refuse une entrée qui n’est pas un Money (DomainError, pas TypeError)', () => {
    expect(() => formatMoney(null as unknown as Money)).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    expect(() => formatMoney({ amount: 1.5, currency: 'XOF' })).toThrow(DomainError);
  });

  it('refuse une devise inconnue', () => {
    expect(() => formatMoney(100, 'EUR' as Currency)).toThrow(expect.objectContaining({ code: 'invalid_currency' }));
    expect(() => formatMoney(100, undefined as unknown as Currency)).toThrow(
      expect.objectContaining({ code: 'invalid_currency' }),
    );
  });
});

describe('Money', () => {
  const xof = (amount: number) => Money.of(amount, 'XOF');

  it('of : entier sûr et devise connue, sinon DomainError', () => {
    expect(xof(25000)).toEqual({ amount: 25000, currency: 'XOF' });
    expect(Object.isFrozen(xof(1))).toBe(true);
    expect(() => xof(0.1)).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    expect(() => xof(Number.MAX_SAFE_INTEGER + 1)).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    expect(() => Money.of(1, 'USD' as Currency)).toThrow(expect.objectContaining({ code: 'invalid_currency' }));
  });

  it('zero, add, subtract, negate', () => {
    expect(Money.zero('GNF')).toEqual({ amount: 0, currency: 'GNF' });
    expect(Money.add(xof(25000), xof(50000))).toEqual(xof(75000));
    expect(Money.subtract(xof(25000), xof(50000))).toEqual(xof(-25000));
    expect(Money.negate(xof(500))).toEqual(xof(-500));
    expect(Money.negate(xof(0)).amount).toBe(0);
    expect(Object.is(Money.negate(xof(0)).amount, -0)).toBe(false);
  });

  it('revalide un Money construit à la main (objet littéral, JSON)', () => {
    const flottant = { amount: 0.5, currency: 'XOF' } as Money;
    const euro = { amount: 1, currency: 'EUR' } as unknown as Money;
    for (const op of [Money.compare, Money.min, Money.max, Money.equals, Money.add, Money.subtract]) {
      expect(() => op(flottant, xof(1))).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
      expect(() => op(xof(1), flottant)).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
      expect(() => op(euro, euro)).toThrow(expect.objectContaining({ code: 'invalid_currency' }));
    }
    for (const op of [Money.isZero, Money.isNegative, Money.negate]) {
      expect(() => op(flottant)).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    }
    expect(Money.check({ amount: -0, currency: 'XOF' })).toEqual(xof(0));
    expect(Object.is(Money.min({ amount: -0, currency: 'XOF' }, xof(5)).amount, -0)).toBe(false);
    expect(() => Money.check('25000')).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
  });

  it('fromDb : bigint ou texte de PostgreSQL, contrôle de plage', () => {
    expect(Money.fromDb(25000n, 'XOF')).toEqual(xof(25000));
    expect(Money.fromDb('-5000', 'XOF')).toEqual(xof(-5000));
    expect(Money.fromDb(BigInt(Number.MAX_SAFE_INTEGER), 'XOF').amount).toBe(Number.MAX_SAFE_INTEGER);
    for (const bad of ['25000.50', '1e6', ' 1', '', 'abc']) {
      expect(() => Money.fromDb(bad, 'XOF')).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    }
    expect(() => Money.fromDb(BigInt(Number.MAX_SAFE_INTEGER) + 1n, 'XOF')).toThrow(
      expect.objectContaining({ code: 'invalid_amount' }),
    );
    expect(() => Money.fromDb(BigInt(Number.MIN_SAFE_INTEGER) - 1n, 'XOF')).toThrow(DomainError);
  });

  it('refuse de mélanger les devises', () => {
    expect(() => Money.add(xof(1), Money.of(1, 'GNF'))).toThrow(expect.objectContaining({ code: 'currency_mismatch' }));
    expect(() => Money.compare(xof(1), Money.of(1, 'XAF'))).toThrow(DomainError);
  });

  it('refuse un résultat hors des entiers sûrs', () => {
    expect(() => Money.add(xof(Number.MAX_SAFE_INTEGER), xof(1))).toThrow(
      expect.objectContaining({ code: 'invalid_amount' }),
    );
  });

  it('compare, equals, isZero, isNegative, min, max', () => {
    expect(Money.compare(xof(1), xof(2))).toBe(-1);
    expect(Money.compare(xof(2), xof(2))).toBe(0);
    expect(Money.compare(xof(3), xof(2))).toBe(1);
    expect(Money.equals(xof(2), xof(2))).toBe(true);
    expect(Money.equals(xof(2), Money.of(2, 'GNF'))).toBe(false);
    expect(Money.isZero(xof(0))).toBe(true);
    expect(Money.isNegative(xof(-1))).toBe(true);
    expect(Money.isNegative(xof(0))).toBe(false);
    expect(Money.min(xof(5), xof(3))).toEqual(xof(3));
    expect(Money.max(xof(5), xof(3))).toEqual(xof(5));
    expect(Money.min(xof(3), xof(5))).toEqual(xof(3));
    expect(Money.max(xof(3), xof(5))).toEqual(xof(5));
  });

  it('sum : somme d’une liste, zéro pour une liste vide', () => {
    expect(Money.sum([xof(25000), xof(25000), xof(10000)], 'XOF')).toEqual(xof(60000));
    expect(Money.sum([], 'XOF')).toEqual(xof(0));
    expect(() => Money.sum([Money.of(1, 'GNF')], 'XOF')).toThrow(DomainError);
  });

  it('isMoney : garde de type', () => {
    expect(Money.isMoney({ amount: 1, currency: 'XOF' })).toBe(true);
    expect(Money.isMoney({ amount: 1.5, currency: 'XOF' })).toBe(false);
    expect(Money.isMoney({ amount: 1 })).toBe(false);
    expect(Money.isMoney({ amount: '1', currency: 'XOF' })).toBe(false);
    expect(Money.isMoney({ amount: 1, currency: 'EUR' })).toBe(false);
    expect(Money.isMoney(null)).toBe(false);
    expect(Money.isMoney(25000)).toBe(false);
  });
});

describe('Money — propriétés', () => {
  const currency = fc.constantFrom<Currency>('XOF', 'XAF', 'GNF');
  const safe = fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MAX_SAFE_INTEGER });
  // Moitié des tirages près de la frontière des entiers sûrs.
  const amount = fc.oneof(
    fc.integer({ min: -1e12, max: 1e12 }),
    fc.integer({ min: Number.MAX_SAFE_INTEGER - 1e6, max: Number.MAX_SAFE_INTEGER }),
    fc.integer({ min: Number.MIN_SAFE_INTEGER, max: Number.MIN_SAFE_INTEGER + 1e6 }),
  );

  it('add lève invalid_amount si et seulement si la somme exacte sort des entiers sûrs', () => {
    fc.assert(
      fc.property(amount, amount, currency, (a, b, c) => {
        const exact = BigInt(a) + BigInt(b);
        const fits = exact <= BigInt(Number.MAX_SAFE_INTEGER) && exact >= BigInt(Number.MIN_SAFE_INTEGER);
        if (fits) expect(BigInt(Money.add(Money.of(a, c), Money.of(b, c)).amount)).toBe(exact);
        else
          expect(() => Money.add(Money.of(a, c), Money.of(b, c))).toThrow(
            expect.objectContaining({ code: 'invalid_amount' }),
          );
      }),
      { numRuns: 2000 },
    );
  });

  it('devises différentes → currency_mismatch, pour toute opération binaire', () => {
    fc.assert(
      fc.property(safe, safe, currency, currency, (a, b, c1, c2) => {
        fc.pre(c1 !== c2);
        for (const op of [Money.add, Money.subtract, Money.compare, Money.min, Money.max]) {
          expect(() => op(Money.of(a, c1), Money.of(b, c2))).toThrow(
            expect.objectContaining({ code: 'currency_mismatch' }),
          );
        }
        expect(Money.equals(Money.of(a, c1), Money.of(a, c2))).toBe(false);
      }),
    );
  });

  it('subtract est l’inverse de add quand rien ne déborde', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e15, max: 1e15 }), fc.integer({ min: -1e15, max: 1e15 }), currency, (a, b, c) => {
        expect(Money.subtract(Money.add(Money.of(a, c), Money.of(b, c)), Money.of(b, c))).toEqual(Money.of(a, c));
      }),
    );
  });

  it('compare est antisymétrique et suit l’ordre des entiers', () => {
    fc.assert(
      fc.property(safe, safe, currency, (a, b, c) => {
        expect(Money.compare(Money.of(a, c), Money.of(b, c))).toBe(a < b ? -1 : a > b ? 1 : 0);
        expect(Money.compare(Money.of(b, c), Money.of(a, c))).toBe(a < b ? 1 : a > b ? -1 : 0);
      }),
    );
  });

  it('formatMoney : chiffres groupés par U+202F, U+00A0 puis le symbole ; relire donne le montant', () => {
    const symbol: Record<Currency, string> = { XOF: 'F', XAF: 'F', GNF: 'FG' };
    fc.assert(
      fc.property(safe, currency, (n, c) => {
        const text = formatMoney(n, c);
        const suffix = `\u00a0${symbol[c]}`;
        expect(text.endsWith(suffix)).toBe(true);
        const body = text.slice(0, -suffix.length);
        expect(body).toMatch(/^-?\d{1,3}(\u202f\d{3})*$/);
        expect(Number(body.replaceAll('\u202f', ''))).toBe(n);
      }),
    );
  });
});
