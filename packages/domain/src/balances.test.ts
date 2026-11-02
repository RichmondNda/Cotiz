import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type Allocation,
  DomainError,
  excludingPayment,
  type LedgerInstallment,
  moveAllocations,
  proposeAllocation,
  validateAllocation,
} from './index.js';

const inst = (id: string, over: Partial<LedgerInstallment> = {}): LedgerInstallment => ({
  id,
  enrollmentId: 'e1',
  kind: 'periodic',
  sequence: Number(id.replace(/\D/g, '')) || 1,
  dueDate: '2026-03-05',
  amountDue: 25000,
  amountPaid: 0,
  amountPending: 0,
  status: 'upcoming',
  ...over,
});
const al = (installmentId: string, amount: number): Allocation => ({ installmentId, amount });

describe('moveAllocations (soldes des échéances, architecture/04 § 4.5)', () => {
  it('validation : le proposé quitte le montant en attente, le confirmé rejoint le versé ; seules les échéances touchées', () => {
    const items = [inst('i1', { amountPending: 25000 }), inst('i2', { amountPending: 25000 }), inst('i3')];
    expect(
      moveAllocations(items, {
        releasePending: [al('i1', 25000), al('i2', 25000)],
        addPaid: [al('i1', 25000), al('i3', 25000)],
      }),
    ).toEqual([inst('i1', { amountPaid: 25000 }), inst('i2'), inst('i3', { amountPaid: 25000 })]);
  });

  it('déclaration puis annulation d’une validation : mouvements inverses, statut persisté inchangé', () => {
    const [declared] = moveAllocations([inst('i1', { status: 'late' })], { addPending: [al('i1', 10000)] });
    expect(declared).toEqual(inst('i1', { amountPending: 10000, status: 'late' }));
    const reverted = moveAllocations([inst('i1', { amountPaid: 25000 })], {
      releasePaid: [al('i1', 25000)],
      addPending: [al('i1', 25000)],
    });
    expect(reverted).toEqual([inst('i1', { amountPending: 25000 })]);
  });

  it('plusieurs mouvements sur une même échéance s’additionnent ; aucun mouvement → rien', () => {
    expect(moveAllocations([inst('i1')], { addPaid: [al('i1', 5000), al('i1', 7000)] })).toEqual([
      inst('i1', { amountPaid: 12000 }),
    ]);
    expect(moveAllocations([inst('i1')], {})).toEqual([]);
  });

  it('refuse un solde négatif, un dépassement du dû, une échéance inconnue ou un montant non entier', () => {
    const fails = (items: LedgerInstallment[], moves: Parameters<typeof moveAllocations>[1]) => {
      expect(() => moveAllocations(items, moves)).toThrow(DomainError);
    };
    fails([inst('i1', { amountPending: 5000 })], { releasePending: [al('i1', 6000)] });
    fails([inst('i1', { amountPaid: 5000 })], { releasePaid: [al('i1', 6000)] });
    fails([inst('i1', { amountPending: 20000 })], { addPaid: [al('i1', 10000)] });
    fails([inst('i1')], { addPending: [al('i9', 1000)] });
    fails([inst('i1')], { addPaid: [al('i1', 0.5)] });
    fails([inst('i1')], { addPaid: [al('i1', -1)] });
  });

  /**
   * Registre en mémoire : déclarations (proposeAllocation), validations (répartition du souscripteur ou ajustée,
   * contrôlée par validateAllocation sur les échéances hors ce paiement), rejets et annulations de validation (la
   * déclaration est reproposée ; refusée si elle ne rentre plus), soldes tenus par moveAllocations.
   * Après chaque opération : soldes stockés = soldes recalculés depuis les répartitions, et 0 ≤ versé + en attente ≤ dû ;
   * une annulation juste après sa validation rend les soldes d'avant.
   */
  it('100 000 registres aléatoires : soldes stockés = soldes recalculés depuis les répartitions', () => {
    interface Payment {
      amount: number;
      state: 'pending' | 'validated' | 'rejected';
      proposed: Allocation[];
      confirmed: Allocation[];
    }
    const op = fc.record({
      kind: fc.constantFrom('declare', 'declare', 'validate', 'validate', 'reject', 'revert'),
      amount: fc.integer({ min: 1, max: 80_000 }),
      pick: fc.nat(),
      adjust: fc.boolean(),
      received: fc.integer({ min: 1, max: 80_000 }),
    });
    const ledger = fc.record({
      dues: fc.array(fc.integer({ min: 1, max: 30_000 }), { minLength: 1, maxLength: 5 }),
      ops: fc.array(op, { minLength: 1, maxLength: 10 }),
    });

    fc.assert(
      fc.property(ledger, ({ dues, ops }) => {
        let stored = dues.map((amountDue, i) => inst(`i${String(i + 1)}`, { amountDue, sequence: i + 1 }));
        const payments: Payment[] = [];
        const store = (changed: LedgerInstallment[]) => {
          stored = stored.map((x) => changed.find((c) => c.id === x.id) ?? x);
        };

        let lastValidated: { payment: Payment; before: LedgerInstallment[] } | undefined;
        for (const o of ops) {
          const pending = payments.filter((p) => p.state === 'pending');
          const validated = payments.filter((p) => p.state === 'validated');
          if (o.kind === 'revert') {
            const p = validated[o.pick % Math.max(validated.length, 1)];
            if (!p) continue;
            let changed: LedgerInstallment[];
            try {
              changed = moveAllocations(stored, { releasePaid: p.confirmed, addPending: p.proposed });
            } catch {
              continue; // la déclaration ne rentre plus : invalid_state
            }
            store(changed);
            p.state = 'pending';
            p.confirmed = [];
            if (lastValidated?.payment === p && JSON.stringify(stored) !== JSON.stringify(lastValidated.before)) {
              throw new Error(
                `annulation : ${JSON.stringify(stored)} au lieu de ${JSON.stringify(lastValidated.before)}`,
              );
            }
            lastValidated = undefined;
          } else if (o.kind === 'declare') {
            let proposed: Allocation[];
            try {
              proposed = proposeAllocation(o.amount, stored);
            } catch {
              continue; // trop-perçu refusé
            }
            payments.push({ amount: o.amount, state: 'pending', proposed, confirmed: [] });
            store(moveAllocations(stored, { addPending: proposed }));
            lastValidated = undefined;
          } else if (pending.length > 0) {
            const p = pending[o.pick % pending.length];
            if (!p) continue;
            if (o.kind === 'reject') {
              store(moveAllocations(stored, { releasePending: p.proposed }));
              p.state = 'rejected';
              lastValidated = undefined;
              continue;
            }
            const view = excludingPayment(stored, p.proposed);
            let final = p.proposed;
            let received = p.amount;
            if (o.adjust) {
              try {
                final = proposeAllocation(o.received, view);
                received = o.received;
              } catch {
                continue;
              }
            }
            if (!validateAllocation(received, final, view, { enrollmentId: 'e1' }).ok) continue;
            lastValidated = { payment: p, before: stored };
            store(moveAllocations(stored, { releasePending: p.proposed, addPaid: final }));
            p.state = 'validated';
            p.confirmed = final;
          }

          // Comparaisons simples (expect() dans 100 000 × 10 tours coûterait plusieurs fois le test) ; fast-check
          // rapporte le contre-exemple réduit.
          const pendingOf = new Map<string, number>();
          const paidOf = new Map<string, number>();
          for (const p of payments) {
            const lines = p.state === 'pending' ? p.proposed : p.state === 'validated' ? p.confirmed : [];
            const into = p.state === 'pending' ? pendingOf : paidOf;
            for (const a of lines) into.set(a.installmentId, (into.get(a.installmentId) ?? 0) + a.amount);
          }
          for (const x of stored) {
            const expected = { pending: pendingOf.get(x.id) ?? 0, paid: paidOf.get(x.id) ?? 0 };
            if (
              x.amountPending !== expected.pending ||
              x.amountPaid !== expected.paid ||
              x.amountPaid + x.amountPending > x.amountDue
            ) {
              throw new Error(`${x.id} : stocké ${JSON.stringify(x)}, attendu ${JSON.stringify(expected)}`);
            }
          }
        }
      }),
      { numRuns: 100_000 },
    );
  }, 120_000);
});
