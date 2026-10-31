import { DomainError } from './errors.js';
import type { Allocation, InstallmentState } from './ledger-types.js';

// Soldes des échéances tenus par les mouvements de répartition (architecture/04-flows § 4.5) : `amountPending` =
// Σ proposées des paiements en attente, `amountPaid` = Σ confirmées des paiements validés (domain-rules § 3).

export interface AllocationMoves {
  /** Proposées ajoutées (déclaration, annulation d'une validation) : rejoignent le montant en attente. */
  addPending?: readonly Allocation[];
  /** Proposées retirées (validation, rejet) : quittent le montant en attente. */
  releasePending?: readonly Allocation[];
  /** Confirmées ajoutées (validation) : rejoignent le versé. */
  addPaid?: readonly Allocation[];
  /** Confirmées annulées (annulation d'une validation) : quittent le versé. */
  releasePaid?: readonly Allocation[];
}

function totals(allocations: readonly Allocation[] | undefined, sign: 1 | -1, into: Map<string, number>): void {
  for (const { installmentId, amount } of allocations ?? []) {
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('invalid_amount', { installmentId });
    into.set(installmentId, (into.get(installmentId) ?? 0) + sign * amount);
  }
}

/**
 * Nouveaux soldes des échéances touchées par ces mouvements, dans l'ordre reçu ; le statut persisté est inchangé
 * (l'appelant le recalcule par installmentStatus). Échéance inconnue, solde négatif ou versé + en attente > dû :
 * `invalid_amount` (la répartition a été contrôlée avant : c'est une incohérence, pas une saisie à corriger).
 */
export function moveAllocations<T extends InstallmentState & { id: string }>(
  installments: readonly T[],
  moves: AllocationMoves,
): T[] {
  const pending = new Map<string, number>();
  const paid = new Map<string, number>();
  totals(moves.addPending, 1, pending);
  totals(moves.releasePending, -1, pending);
  totals(moves.addPaid, 1, paid);
  totals(moves.releasePaid, -1, paid);
  const touched = new Set([...pending.keys(), ...paid.keys()]);
  for (const id of touched) {
    if (!installments.some((x) => x.id === id)) throw new DomainError('invalid_amount', { installmentId: id });
  }

  return installments
    .filter((x) => touched.has(x.id))
    .map((x) => {
      const amountPending = x.amountPending + (pending.get(x.id) ?? 0);
      const amountPaid = x.amountPaid + (paid.get(x.id) ?? 0);
      if (amountPending < 0 || amountPaid < 0 || amountPaid + amountPending > x.amountDue) {
        throw new DomainError('invalid_amount', { installmentId: x.id });
      }
      return { ...x, amountPending, amountPaid };
    });
}
