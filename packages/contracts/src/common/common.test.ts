import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Instant, IsoDate, ListQuery, Money, Problem, Uuid, listOf } from '../index.js';

describe('Money', () => {
  it('accepte un entier et une devise connue', () => {
    expect(Money.parse({ amount: 25000, currency: 'XOF' })).toEqual({ amount: 25000, currency: 'XOF' });
    expect(Money.safeParse({ amount: -5000, currency: 'XOF' }).success).toBe(true);
    expect(Money.safeParse({ amount: 1000000, currency: 'GNF' }).success).toBe(true);
  });

  it.each([
    ['décimal', { amount: 25000.5, currency: 'XOF' }],
    ['chaîne', { amount: '25000', currency: 'XOF' }],
    ['entier non sûr', { amount: 2 ** 53, currency: 'XOF' }],
    ['devise inconnue', { amount: 25000, currency: 'EUR' }],
    ['devise absente', { amount: 25000 }],
  ])('refuse un montant %s', (_cas, value) => {
    expect(Money.safeParse(value).success).toBe(false);
  });
});

describe('dates et identifiants', () => {
  it('IsoDate : YYYY-MM-DD valide uniquement', () => {
    expect(IsoDate.safeParse('2026-10-05').success).toBe(true);
    expect(IsoDate.safeParse('2026-02-30').success).toBe(false);
    expect(IsoDate.safeParse('2026-10-05T00:00:00Z').success).toBe(false);
  });

  it('Instant : horodatage UTC', () => {
    expect(Instant.safeParse('2026-09-12T14:03:22Z').success).toBe(true);
    expect(Instant.safeParse('2026-09-12T14:03:22.120Z').success).toBe(true);
    expect(Instant.safeParse('2026-09-12').success).toBe(false);
  });

  it('Uuid : accepte un UUID v7', () => {
    expect(Uuid.safeParse('01928f3e-6a7b-7c3d-9e4f-123456789abc').success).toBe(true);
    expect(Uuid.safeParse('pm-awa-kone').success).toBe(false);
  });
});

describe('listes', () => {
  const Item = z.object({ id: z.string() });

  it('enveloppe items, nextCursor, total, facets', () => {
    const List = listOf(Item);
    const value = { items: [{ id: 'a' }], nextCursor: null, total: 52, facets: { status: { late: 14 } } };
    expect(List.parse(value)).toEqual(value);
    expect(List.safeParse({ items: [], nextCursor: null, total: 0 }).success).toBe(true);
    expect(List.safeParse({ items: [], total: 0 }).success).toBe(false);
    expect(List.safeParse({ items: [], nextCursor: null, total: -1 }).success).toBe(false);
  });

  it('paramètres : limit ≤ 100, 25 par défaut', () => {
    expect(ListQuery.parse({})).toEqual({ limit: 25 });
    expect(ListQuery.parse({ limit: '50', cursor: 'abc', sort: '-dueDate' })).toEqual({
      limit: 50,
      cursor: 'abc',
      sort: '-dueDate',
    });
    expect(ListQuery.safeParse({ limit: '101' }).success).toBe(false);
    expect(ListQuery.safeParse({ limit: '0' }).success).toBe(false);
  });
});

describe('Problem (RFC 9457)', () => {
  const exemple = {
    type: 'https://docs.cotiz.app/errors/allocation_mismatch',
    title: 'La répartition ne correspond pas au montant',
    status: 422,
    code: 'allocation_mismatch',
    detail: 'Montant reçu : 75000, total réparti : 50000',
    fields: { allocations: 'sum_must_equal_amount' },
    requestId: '01J9ZK3M8Q',
  };

  it("accepte l'exemple de architecture/06 et garde les membres d'extension", () => {
    expect(Problem.parse({ ...exemple, maxAmount: 50000 })).toEqual({ ...exemple, maxAmount: 50000 });
  });

  it('refuse un code absent du catalogue', () => {
    expect(Problem.safeParse({ ...exemple, code: 'oops' }).success).toBe(false);
  });
});
