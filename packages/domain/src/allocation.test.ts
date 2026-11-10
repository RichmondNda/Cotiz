import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DomainError,
  excludingPayment,
  openRemainingOf,
  previewAllocation,
  proposeAllocation,
  remainingOf,
  validateAllocation,
} from './index.js';
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

describe('openRemainingOf — reste dû ouvert (plafond de proposeAllocation, aperçu me.alloc)', () => {
  it.each(proposals.cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const total = openRemainingOf(c.input.installments);
    if (c.error?.code === 'amount_exceeds_remaining') expect(total).toBe(c.error.maxAmount);
    if (c.output) {
      // Aucune échéance ouverte n'est laissée de côté tant qu'il reste à répartir : Σ proposé ≤ reste ouvert.
      expect(c.output.reduce((s, a) => s + a.amount, 0)).toBeLessThanOrEqual(total);
    }
  });
  it('payée, dispensée, annulée et montant en attente exclus', () => {
    const base = {
      enrollmentId: 'e1',
      kind: 'periodic' as const,
      dueDate: '2026-08-05',
      lateFrom: null,
      amountDue: 25000,
    };
    expect(
      openRemainingOf([
        { ...base, id: 'a', sequence: 1, amountPaid: 25000, amountPending: 0, status: 'paid' },
        { ...base, id: 'b', sequence: 2, amountPaid: 0, amountPending: 0, status: 'waived' },
        { ...base, id: 'c', sequence: 3, amountPaid: 0, amountPending: 0, status: 'canceled' },
        { ...base, id: 'd', sequence: 4, amountPaid: 5000, amountPending: 10000, status: 'declared' },
        { ...base, id: 'e', sequence: 5, amountPaid: 0, amountPending: 0, status: 'late' },
      ]),
    ).toBe(10000 + 25000);
  });
  it('montant invalide → invalid_amount', () => {
    expect(() =>
      openRemainingOf([
        {
          id: 'x',
          enrollmentId: 'e1',
          kind: 'periodic',
          sequence: 1,
          dueDate: '2026-08-05',
          lateFrom: null,
          amountDue: 25000,
          amountPaid: -1,
          amountPending: 0,
          status: 'late',
        },
      ]),
    ).toThrow(DomainError);
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
  lateFrom: null,
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

  it('remainingOf d’une échéance annulée = 0 : plus rien n’est dû (retrait, clôture)', () => {
    expect(remainingOf(inst('a', { amountPaid: 10000, status: 'canceled' }))).toBe(0);
    expect(remainingOf(inst('a', { status: 'canceled' }))).toBe(0);
  });

  it('remainingOf d’une échéance dispensée = 0 : plus rien n’est dû', () => {
    expect(remainingOf(inst('a', { amountPaid: 10000, status: 'waived' }))).toBe(0);
    expect(remainingOf(inst('a', { status: 'waived' }))).toBe(0);
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

describe('validation par le gestionnaire (architecture/04-flows § 4.5)', () => {
  // Moussa déclare 50 000 F sur août (i8) et septembre (i9) : les deux échéances sont « declared ».
  const declared = [
    inst('i8', { amountPending: 25000, status: 'declared' }),
    inst('i9', { dueDate: '2026-09-05', sequence: 2, amountPending: 25000, status: 'declared' }),
  ];
  const proposed = [
    { installmentId: 'i8', amount: 25000 },
    { installmentId: 'i9', amount: 25000 },
  ];

  it('sans retirer les allocations du paiement en cours : échéances vues fermées (piège à éviter)', () => {
    expect(validateAllocation(50000, proposed, declared).errors.map((e) => e.code)).toEqual([
      'installment_not_open',
      'installment_not_open',
    ]);
  });

  it('avec excludingPayment : la répartition proposée est valide', () => {
    expect(validateAllocation(50000, proposed, excludingPayment(declared, proposed))).toEqual({
      ok: true,
      errors: [],
      remainingToAllocate: 0,
    });
  });

  it('montant reçu (40 000) différent du déclaré, répartition inchangée → allocation_mismatch', () => {
    expect(validateAllocation(40000, proposed, excludingPayment(declared, proposed))).toEqual({
      ok: false,
      errors: [{ code: 'allocation_mismatch', expected: 40000, allocated: 50000 }],
      remainingToAllocate: 0,
    });
  });

  it('excludingPayment : ne touche que les échéances du paiement ; refuse d’en retirer plus qu’en attente', () => {
    const other = inst('i10', { dueDate: '2026-10-05', status: 'upcoming' });
    const result = excludingPayment([...declared, other], proposed);
    expect(result.map((x) => x.amountPending)).toEqual([0, 0, 0]);
    expect(result[2]).toBe(other);
    expect(() =>
      excludingPayment([inst('i8', { amountPending: 1000 })], [{ installmentId: 'i8', amount: 25000 }]),
    ).toThrow(expect.objectContaining({ code: 'invalid_amount' }));
  });

  it('inscription du paiement : des allocations sur une autre inscription sont refusées', () => {
    const e2 = [inst('x', { enrollmentId: 'e2' })];
    const allocations = [{ installmentId: 'x', amount: 25000 }];
    expect(validateAllocation(25000, allocations, e2).ok).toBe(true);
    expect(validateAllocation(25000, allocations, e2, { enrollmentId: 'e1' }).errors).toEqual([
      { code: 'mixed_enrollments' },
    ]);
    expect(validateAllocation(25000, allocations, e2, { enrollmentId: 'e2' }).ok).toBe(true);
  });
});

/** Ordre de domain-rules § 4.2 : date, fonds d'entrée avant mensualité, séquence. */
const dueOrder = (a: LedgerInstallment, b: LedgerInstallment) =>
  a.dueDate !== b.dueDate
    ? a.dueDate < b.dueDate
      ? -1
      : 1
    : (a.kind === 'entry_fee' ? 0 : 1) - (b.kind === 'entry_fee' ? 0 : 1) || a.sequence - b.sequence;

describe('répartition — propriétés', () => {
  const STATUSES = ['upcoming', 'due', 'declared', 'partial', 'late', 'paid', 'waived', 'canceled'] as const;
  const installment = fc
    .record({
      kind: fc.constantFrom<'entry_fee' | 'periodic'>('entry_fee', 'periodic'),
      sequence: fc.integer({ min: 0, max: 40 }),
      day: fc.integer({ min: 0, max: 400 }),
      amountDue: fc.oneof(fc.integer({ min: 1, max: 500_000 }), fc.integer({ min: 2 ** 50, max: 2 ** 51 })),
      paidShare: fc.double({ min: 0, max: 1, noNaN: true }),
      pendingShare: fc.double({ min: 0, max: 1, noNaN: true }),
      status: fc.constantFrom(...STATUSES),
      enrollmentId: fc.constantFrom('e1', 'e1', 'e1', 'e2'),
    })
    .map((r) => {
      const amountPaid = Math.floor(r.amountDue * r.paidShare);
      const amountPending = Math.floor((r.amountDue - amountPaid) * r.pendingShare);
      const dueDate = new Date(Date.UTC(2026, 0, 1 + r.day)).toISOString().slice(0, 10);
      return { ...r, dueDate, amountPaid, amountPending };
    });
  const list = fc.array(installment, { minLength: 1, maxLength: 12 }).map((items) =>
    items.map(
      (
        { kind, sequence, dueDate, amountDue, amountPaid, amountPending, status, enrollmentId },
        i,
      ): LedgerInstallment => ({
        id: `i${String(i)}`,
        enrollmentId,
        lateFrom: null,
        kind,
        sequence,
        dueDate,
        amountDue,
        amountPaid,
        amountPending,
        status,
      }),
    ),
  );

  // Oracle indépendant de l'implémentation : définition littérale de « ouverte » et de l'ordre (§ 3, § 4.2).
  const oracleOpen = (x: LedgerInstallment) =>
    !['paid', 'waived', 'canceled'].includes(x.status) && x.amountDue - x.amountPaid - x.amountPending > 0;
  const oracle = (amount: number, items: readonly LedgerInstallment[]) => {
    const open = items.filter(oracleOpen).sort(dueOrder);
    const total = open.reduce((s, x) => s + (x.amountDue - x.amountPaid - x.amountPending), 0);
    if (amount > total) return { maxAmount: total };
    const out: { installmentId: string; amount: number }[] = [];
    let left = amount;
    for (const x of open) {
      const rest = x.amountDue - x.amountPaid - x.amountPending;
      if (left === 0) break;
      out.push({ installmentId: x.id, amount: Math.min(left, rest) });
      left -= Math.min(left, rest);
    }
    return { allocations: out };
  };

  it('openRemainingOf = plafond de proposeAllocation : le total passe en entier, un franc de plus est refusé', () => {
    fc.assert(
      fc.property(list, (items) => {
        const total = openRemainingOf(items);
        // Totaux représentables seulement (pr.create refuse un total non sûr : total_too_large, § 2.7).
        fc.pre(Number.isSafeInteger(total + 1));
        expect(total).toBe(
          items.filter(oracleOpen).reduce((s, x) => s + (x.amountDue - x.amountPaid - x.amountPending), 0),
        );
        if (total > 0) {
          const all = proposeAllocation(total, items);
          expect(all.reduce((s, a) => s + a.amount, 0)).toBe(total);
          expect(previewAllocation(total, items).remainingAfter).toBe(0);
        }
        expect(() => proposeAllocation(total + 1, items)).toThrow(
          expect.objectContaining({ code: 'amount_exceeds_remaining', details: { maxAmount: total } }),
        );
      }),
      { numRuns: 2000 },
    );
  });

  it('previewAllocation : proposition identique à proposeAllocation, reste après = total ouvert − montant', () => {
    const scenario = list.chain((items) => {
      const total = openRemainingOf(items);
      return fc.tuple(fc.constant(items), fc.integer({ min: 1, max: Math.max(1, total) }));
    });
    fc.assert(
      fc.property(scenario, ([items, amount]) => {
        const total = openRemainingOf(items);
        fc.pre(total > 0 && Number.isSafeInteger(total));
        const preview = previewAllocation(amount, items);
        expect(preview.allocations).toEqual(proposeAllocation(amount, items));
        expect(preview.remainingAfter).toBe(total - amount);
        expect(preview.remainingAfter).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 2000 },
    );
  });

  it('proposeAllocation = remplissage glouton exact des échéances ouvertes triées (10 000 cas, trop-perçu compris)', () => {
    const scenario = list.chain((items) => {
      const total = items.filter(oracleOpen).reduce((s, x) => s + x.amountDue - x.amountPaid - x.amountPending, 0);
      const max = Math.min(Number.MAX_SAFE_INTEGER, Math.floor(total * 1.2) + 2);
      return fc.record({ items: fc.constant(items), amount: fc.integer({ min: 1, max }) });
    });
    let overpaid = 0;
    fc.assert(
      fc.property(scenario, ({ items, amount }) => {
        const expected = oracle(amount, items);
        if ('maxAmount' in expected) {
          overpaid += 1;
          expect(() => proposeAllocation(amount, items)).toThrow(
            expect.objectContaining({ code: 'amount_exceeds_remaining', details: { maxAmount: expected.maxAmount } }),
          );
        } else {
          expect(proposeAllocation(amount, items)).toEqual(expected.allocations);
        }
      }),
      { numRuns: 10_000 },
    );
    // La branche du trop-perçu est réellement exercée.
    expect(overpaid).toBeGreaterThan(500);
  });

  it('sûreté : si validateAllocation est ok, la répartition respecte l’invariant de la base', () => {
    const allocation = (items: readonly LedgerInstallment[]) =>
      fc.record({
        installmentId: fc.oneof(fc.constantFrom(...items.map((x) => x.id)), fc.constant('inconnue')),
        amount: fc.oneof(
          fc.integer({ min: 1, max: 600_000 }),
          fc.constantFrom(0, -1, 0.5, Number.NaN, 2 ** 53),
          fc.integer({ min: 2 ** 49, max: 2 ** 51 }),
        ),
      });
    const scenario = list.chain((items) =>
      fc.record({
        items: fc.constant(items),
        allocations: fc.array(allocation(items), { maxLength: 6 }),
        amount: fc.oneof(fc.integer({ min: -10, max: 2_000_000 }), fc.constantFrom(0.5, Number.NaN)),
        enrollmentId: fc.option(fc.constantFrom('e1', 'e2'), { nil: undefined }),
      }),
    );
    fc.assert(
      fc.property(scenario, ({ items, allocations, amount, enrollmentId }) => {
        const result = validateAllocation(amount, allocations, items, { enrollmentId });
        expect(result.ok).toBe(result.errors.length === 0);
        expect(Number.isSafeInteger(result.remainingToAllocate) && result.remainingToAllocate >= 0).toBe(true);
        const positive = allocations.filter((a) => Number.isSafeInteger(a.amount) && a.amount > 0);
        const sum = positive.reduce((s, a) => s + a.amount, 0);
        if (Number.isSafeInteger(amount) && amount > 0 && Number.isSafeInteger(sum)) {
          expect(result.errors.some((e) => e.code === 'allocation_mismatch')).toBe(sum !== amount);
        }
        if (!result.ok) return;
        const byId = new Map(items.map((x) => [x.id, x]));
        expect(new Set(allocations.map((a) => a.installmentId)).size).toBe(allocations.length);
        expect(sum).toBe(amount);
        const enrollments = new Set<string>();
        for (const a of allocations) {
          const x = byId.get(a.installmentId);
          expect(x && oracleOpen(x)).toBe(true);
          if (!x) continue;
          enrollments.add(x.enrollmentId);
          expect(Number.isSafeInteger(a.amount) && a.amount > 0).toBe(true);
          // Après application : amountPaid + amountPending ≤ amountDue (contrainte de schema.sql).
          expect(x.amountPaid + x.amountPending + a.amount).toBeLessThanOrEqual(x.amountDue);
        }
        expect(enrollments.size).toBeLessThanOrEqual(1);
        if (enrollmentId !== undefined && enrollments.size === 1) expect([...enrollments]).toEqual([enrollmentId]);
      }),
      { numRuns: 10_000 },
    );
  });

  it('validateAllocation(proposeAllocation(x)) est ok, contrôlé aussi par l’oracle', () => {
    fc.assert(
      fc.property(list, fc.integer({ min: 1, max: 1_000_000 }), (items, amount) => {
        const single = items.map((x) => ({ ...x, enrollmentId: 'e1' }));
        const expected = oracle(amount, single);
        fc.pre('allocations' in expected);
        const allocations = proposeAllocation(amount, single);
        expect(validateAllocation(amount, allocations, single, { enrollmentId: 'e1' })).toEqual({
          ok: true,
          errors: [],
          remainingToAllocate: 0,
        });
      }),
      { numRuns: 10_000 },
    );
  });
});
