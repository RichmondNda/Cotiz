import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DomainError, proposeAllocation, remainingOf, validateAllocation } from './index.js';
import type { Allocation, LedgerInstallment, ValidationResult } from './index.js';
import { loadVectors } from './test-vectors.js';

interface ProposeCase {
  name: string;
  input: { amount: number; installments: LedgerInstallment[] };
  output?: Allocation[];
  error?: { code: string; maxAmount?: number };
}
interface ValidateCase {
  name: string;
  input: { amount: number; allocations: Allocation[]; installments: LedgerInstallment[] };
  output: ValidationResult;
}
const proposals = loadVectors<ProposeCase>('allocation');
const validations = loadVectors<ValidateCase>('validation');

function propose(amount: number, installments: LedgerInstallment[]) {
  try {
    return { output: proposeAllocation(amount, installments) };
  } catch (e) {
    if (e instanceof DomainError) return { output: null, error: { code: e.code, ...e.details } };
    throw e;
  }
}

describe('proposeAllocation — vecteurs allocation.json', () => {
  it('le fichier décrit proposeAllocation', () => {
    expect(proposals.function).toBe('proposeAllocation');
  });
  it.each(proposals.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = propose(c.input.amount, c.input.installments);
    expect(result.output).toEqual(c.output ?? null);
    // Les champs du vecteur (code, maxAmount) à l'identique ; d'autres détails peuvent s'y ajouter.
    if (c.error) expect(result.error).toMatchObject(c.error);
    else expect(result.error).toBeUndefined();
  });
});

describe('validateAllocation — vecteurs validation.json', () => {
  it('le fichier décrit validateAllocation', () => {
    expect(validations.function).toBe('validateAllocation');
  });
  it.each(validations.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    expect(validateAllocation(c.input.amount, c.input.allocations, c.input.installments)).toEqual(c.output);
  });
});

const inst = (id: string, patch: Partial<LedgerInstallment> = {}): LedgerInstallment => ({
  id,
  enrollmentId: 'e1',
  kind: 'periodic',
  sequence: 1,
  dueDate: '2026-08-05',
  amountDue: 25000,
  amountPaid: 0,
  amountPending: 0,
  status: 'late',
  ...patch,
});

describe('répartition — cas limites', () => {
  it('remainingOf = dû − payé − en attente', () => {
    expect(remainingOf(inst('a', { amountPaid: 10000, amountPending: 5000 }))).toBe(10000);
  });

  it('proposeAllocation : montant non entier ou non sûr → invalid_amount', () => {
    for (const amount of [0, 0.5, Number.NaN, 2 ** 53]) {
      expect(() => proposeAllocation(amount, [inst('a')])).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
    }
  });

  it('échéance aux montants corrompus (décimal, négatif) → invalid_amount levée', () => {
    for (const bad of [
      inst('a', { amountPaid: 0.5 }),
      inst('a', { amountPending: -1 }),
      inst('a', { amountDue: 2 ** 53 }),
    ]) {
      expect(() => proposeAllocation(1000, [bad])).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
      expect(() => validateAllocation(1000, [{ installmentId: 'a', amount: 1000 }], [bad])).toThrow(
        expect.objectContaining({ code: 'invalid_amount' }),
      );
    }
  });

  it('proposeAllocation : aucune échéance ouverte → amount_exceeds_remaining avec maxAmount 0', () => {
    expect(() => proposeAllocation(1, [inst('a', { status: 'paid', amountPaid: 25000 })])).toThrow(
      expect.objectContaining({ code: 'amount_exceeds_remaining', details: { maxAmount: 0 } }),
    );
  });

  it('proposeAllocation : canceled et reste nul ignorés ; ordre date, fonds d’entrée, séquence', () => {
    const list = [
      inst('c', { sequence: 3, dueDate: '2026-09-05' }),
      inst('b', { sequence: 2, dueDate: '2026-08-05' }),
      inst('x', { status: 'canceled' }),
      inst('z', { amountPending: 25000, status: 'late' }),
      inst('a', { sequence: 1, dueDate: '2026-08-05' }),
    ];
    expect(proposeAllocation(75000, list)).toEqual([
      { installmentId: 'a', amount: 25000 },
      { installmentId: 'b', amount: 25000 },
      { installmentId: 'c', amount: 25000 },
    ]);
  });

  it('proposeAllocation ne modifie pas la liste reçue', () => {
    const list = [inst('b', { dueDate: '2026-09-05' }), inst('a')];
    const copy = structuredClone(list);
    proposeAllocation(30000, list);
    expect(list).toEqual(copy);
  });

  it('validateAllocation : toutes les erreurs sont rapportées, sans arrêt à la première', () => {
    const result = validateAllocation(
      60000,
      [
        { installmentId: 'a', amount: 30000 },
        { installmentId: 'a', amount: 1000 },
        { installmentId: 'inconnue', amount: 1000 },
        { installmentId: 'b', amount: -1 },
        { installmentId: 'd', amount: 1000 },
      ],
      [inst('a'), inst('b'), inst('d', { enrollmentId: 'e2' })],
    );
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toEqual([
      'allocation_exceeds_remaining',
      'duplicate_installment',
      'installment_not_open',
      'allocation_not_positive',
      'mixed_enrollments',
      'allocation_mismatch',
    ]);
    expect(result.remainingToAllocate).toBe(60000 - 33000);
  });

  it('validateAllocation : montant invalide → invalid_amount, reste à répartir 0', () => {
    const result = validateAllocation(-5, [{ installmentId: 'a', amount: 25000 }], [inst('a')]);
    expect(result.errors[0]).toEqual({ code: 'invalid_amount' });
    expect(result.remainingToAllocate).toBe(0);
  });

  it('validateAllocation : une allocation décimale est refusée et exclue de la somme', () => {
    const result = validateAllocation(25000, [{ installmentId: 'a', amount: 24999.5 }], [inst('a')]);
    expect(result.errors).toEqual([
      { code: 'allocation_not_positive', installmentId: 'a' },
      { code: 'allocation_mismatch', expected: 25000, allocated: 0 },
    ]);
    expect(Number.isInteger(result.remainingToAllocate)).toBe(true);
  });

  it('validateAllocation : liste vide → allocation_mismatch', () => {
    expect(validateAllocation(1000, [], [inst('a')]).errors).toEqual([
      { code: 'allocation_mismatch', expected: 1000, allocated: 0 },
    ]);
  });
});

/** Ordre de domain-rules § 4.2 : date, fonds d'entrée avant mensualité, séquence. */
const dueOrder = (a: LedgerInstallment, b: LedgerInstallment) =>
  a.dueDate !== b.dueDate
    ? a.dueDate < b.dueDate
      ? -1
      : 1
    : (a.kind === 'entry_fee' ? 0 : 1) - (b.kind === 'entry_fee' ? 0 : 1) || a.sequence - b.sequence;

describe('répartition — propriétés (10 000 cas)', () => {
  const installment = fc
    .record({
      kind: fc.constantFrom<'entry_fee' | 'periodic'>('entry_fee', 'periodic'),
      sequence: fc.integer({ min: 0, max: 40 }),
      day: fc.integer({ min: 0, max: 400 }),
      amountDue: fc.integer({ min: 1, max: 500_000 }),
      paidShare: fc.double({ min: 0, max: 1, noNaN: true }),
      pendingShare: fc.double({ min: 0, max: 1, noNaN: true }),
      status: fc.constantFrom('upcoming', 'due', 'declared', 'partial', 'late', 'paid', 'waived', 'canceled'),
    })
    .map((r) => {
      const amountPaid = Math.floor(r.amountDue * r.paidShare);
      const amountPending = Math.floor((r.amountDue - amountPaid) * r.pendingShare);
      const d = new Date(Date.UTC(2026, 0, 1 + r.day)).toISOString().slice(0, 10);
      return {
        kind: r.kind,
        sequence: r.sequence,
        dueDate: d,
        amountDue: r.amountDue,
        amountPaid,
        amountPending,
        status: r.status,
      };
    });
  const scenario = fc
    .array(installment, { minLength: 1, maxLength: 20 })
    .map((list) => list.map((x, i): LedgerInstallment => ({ ...x, id: `i${String(i)}`, enrollmentId: 'e1' })))
    .chain((list) => {
      const open = list.filter((x) => !['paid', 'waived', 'canceled'].includes(x.status) && remainingOf(x) > 0);
      const max = open.reduce((s, x) => s + remainingOf(x), 0);
      return fc.record({
        list: fc.constant(list),
        amount: fc.integer({ min: 1, max: Math.max(1, max) }),
        max: fc.constant(max),
      });
    });

  it('Σ = montant, aucune allocation > reste, ordre respecté, et validateAllocation(proposeAllocation(x)).ok', () => {
    fc.assert(
      fc.property(scenario, ({ list, amount, max }) => {
        if (amount > max) {
          expect(() => proposeAllocation(amount, list)).toThrow(
            expect.objectContaining({ code: 'amount_exceeds_remaining', details: { maxAmount: max } }),
          );
          return;
        }
        const allocations = proposeAllocation(amount, list);
        const byId = new Map(list.map((x) => [x.id, x]));
        expect(allocations.reduce((s, a) => s + a.amount, 0)).toBe(amount);
        let previous: LedgerInstallment | undefined;
        allocations.forEach((a, k) => {
          const x = byId.get(a.installmentId);
          expect(x).toBeDefined();
          if (!x) return;
          expect(Number.isInteger(a.amount) && a.amount > 0).toBe(true);
          expect(a.amount).toBeLessThanOrEqual(remainingOf(x));
          // Toutes les allocations sauf la dernière remplissent l'échéance (remplissage glouton).
          if (k < allocations.length - 1) expect(a.amount).toBe(remainingOf(x));
          if (previous) expect(dueOrder(previous, x)).toBeLessThanOrEqual(0);
          previous = x;
        });
        expect(validateAllocation(amount, allocations, list)).toEqual({ ok: true, errors: [], remainingToAllocate: 0 });
      }),
      { numRuns: 10_000 },
    );
  });

  it('remainingToAllocate = montant − Σ des allocations valides, jamais négatif', () => {
    fc.assert(
      fc.property(
        scenario,
        fc.array(fc.integer({ min: 1, max: 100_000 }), { maxLength: 5 }),
        ({ list, amount }, parts) => {
          const allocations = parts.map((p, i) => ({ installmentId: list[i % list.length]?.id ?? 'x', amount: p }));
          const sum = parts.reduce((s, p) => s + p, 0);
          const result = validateAllocation(amount, allocations, list);
          expect(result.remainingToAllocate).toBe(Math.max(0, amount - sum));
          expect(result.ok).toBe(result.errors.length === 0);
          if (sum !== amount) expect(result.errors.some((e) => e.code === 'allocation_mismatch')).toBe(true);
        },
      ),
      { numRuns: 2000 },
    );
  });
});
