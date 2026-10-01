import { DomainError } from './errors.js';

// Argent (domain-rules.md § 1) : entier dans la plus petite unité de la devise, jamais de flottant.
// Le franc CFA n'a pas de subdivision : 25 000 F = 25000.
// `Money` est une forme JSON (contrat d'API) : chaque opération revalide ses entrées, aucun objet n'est cru sur parole.

export type Currency = 'XOF' | 'XAF' | 'GNF';
const CURRENCIES: readonly Currency[] = ['XOF', 'XAF', 'GNF'];

export interface Money {
  readonly amount: number;
  readonly currency: Currency;
}

function assertAmount(amount: unknown): asserts amount is number {
  if (typeof amount !== 'number' || !Number.isSafeInteger(amount)) throw new DomainError('invalid_amount', { amount });
}

function assertCurrency(currency: unknown): asserts currency is Currency {
  if (!(CURRENCIES as readonly unknown[]).includes(currency)) throw new DomainError('invalid_currency', { currency });
}

function of(amount: number, currency: Currency): Money {
  assertAmount(amount);
  assertCurrency(currency);
  // `+ 0` normalise -0 en 0.
  return Object.freeze({ amount: amount + 0, currency });
}

/** Revalide un `Money` reçu (JSON, objet littéral) et le normalise. */
function check(value: unknown): Money {
  if (typeof value !== 'object' || value === null) throw new DomainError('invalid_amount', { amount: value });
  const { amount, currency } = value as Record<string, unknown>;
  assertAmount(amount);
  assertCurrency(currency);
  return of(amount, currency);
}

function pair(a: Money, b: Money): [Money, Money] {
  const left = check(a);
  const right = check(b);
  if (left.currency !== right.currency) {
    throw new DomainError('currency_mismatch', { left: left.currency, right: right.currency });
  }
  return [left, right];
}

function compare(a: Money, b: Money): -1 | 0 | 1 {
  const [left, right] = pair(a, b);
  return left.amount < right.amount ? -1 : left.amount > right.amount ? 1 : 0;
}

/** Montant lu en base (`bigint`, ou texte de PostgreSQL) : jamais de `Number()` / `parseFloat` improvisé. */
function fromDb(value: bigint | string, currency: Currency): Money {
  if (typeof value === 'string' && !/^-?\d+$/.test(value)) throw new DomainError('invalid_amount', { amount: value });
  const big = typeof value === 'bigint' ? value : BigInt(value);
  if (big > BigInt(Number.MAX_SAFE_INTEGER) || big < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new DomainError('invalid_amount', { amount: String(big) });
  }
  return of(Number(big), currency);
}

export const Money = {
  of,
  check,
  fromDb,
  zero: (currency: Currency): Money => of(0, currency),
  /** Résultat contrôlé : hors des entiers sûrs → `invalid_amount`. */
  add: (a: Money, b: Money): Money => {
    const [left, right] = pair(a, b);
    return of(left.amount + right.amount, left.currency);
  },
  subtract: (a: Money, b: Money): Money => {
    const [left, right] = pair(a, b);
    return of(left.amount - right.amount, left.currency);
  },
  negate: (a: Money): Money => {
    const value = check(a);
    return of(-value.amount, value.currency);
  },
  sum: (items: readonly Money[], currency: Currency): Money =>
    items.reduce((total, item) => Money.add(total, item), of(0, currency)),
  /** Devises différentes → `currency_mismatch`. */
  compare,
  /** Égalité stricte (montant et devise) : `false`, sans erreur, si les devises diffèrent. */
  equals: (a: Money, b: Money): boolean => {
    const left = check(a);
    const right = check(b);
    return left.currency === right.currency && left.amount === right.amount;
  },
  min: (a: Money, b: Money): Money => {
    const [left, right] = pair(a, b);
    return left.amount <= right.amount ? left : right;
  },
  max: (a: Money, b: Money): Money => {
    const [left, right] = pair(a, b);
    return left.amount >= right.amount ? left : right;
  },
  isZero: (a: Money): boolean => check(a).amount === 0,
  isNegative: (a: Money): boolean => check(a).amount < 0,
  isMoney(value: unknown): value is Money {
    if (typeof value !== 'object' || value === null) return false;
    const { amount, currency } = value as Record<string, unknown>;
    return (
      typeof amount === 'number' &&
      Number.isSafeInteger(amount) &&
      (CURRENCIES as readonly unknown[]).includes(currency)
    );
  },
} as const;

const SYMBOLS: Record<Currency, string> = { XOF: 'F', XAF: 'F', GNF: 'FG' };
const THIN_NBSP = '\u202f';
const NBSP = '\u00a0';

/**
 * `25 000 F` : milliers séparés par U+202F (espace fine insécable), U+00A0 avant le symbole, signe `-` ASCII.
 * Vecteurs : docs/specs/test-vectors/money.json.
 */
export function formatMoney(money: Money): string;
export function formatMoney(amount: number, currency: Currency): string;
export function formatMoney(value: Money | number, currency?: Currency): string {
  const money = typeof value === 'number' ? check({ amount: value, currency }) : check(value);
  const digits = String(Math.abs(money.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP);
  return `${money.amount < 0 ? '-' : ''}${digits}${NBSP}${SYMBOLS[money.currency]}`;
}
