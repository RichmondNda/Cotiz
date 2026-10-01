import { DomainError } from './errors.js';
import type { Allocation, LedgerInstallment } from './ledger-types.js';

// Répartition d'un paiement sur des échéances : domain-rules.md § 3 à 5.
// Vecteurs normatifs : test-vectors/allocation.json et validation.json.

const CLOSED = new Set(['paid', 'waived', 'canceled']);

/** Reste dû : `amountDue − amountPaid − amountPending` (§ 3). */
export function remainingOf(installment: LedgerInstallment): number {
  return installment.amountDue - installment.amountPaid - installment.amountPending;
}

/**
 * Ouverte : statut persisté ni `paid`, ni `waived`, ni `canceled`, et reste dû > 0 (§ 3, lecture littérale).
 * L'appelant doit donc tenir le statut persisté à jour (recalcul par `installmentStatus` dans la transaction).
 */
function isOpen(installment: LedgerInstallment): boolean {
  return !CLOSED.has(installment.status) && remainingOf(installment) > 0;
}

function assertInstallment(x: LedgerInstallment): void {
  for (const value of [x.amountDue, x.amountPaid, x.amountPending]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { installmentId: x.id });
  }
}

/** Date d'échéance croissante, fonds d'entrée avant mensualité à date égale, puis séquence (§ 4.2). */
function byDueOrder(a: LedgerInstallment, b: LedgerInstallment): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === 'entry_fee' ? -1 : 1;
  return a.sequence - b.sequence;
}

/**
 * Proposition gloutonne (§ 4) : chaque échéance ouverte, dans l'ordre, reçoit `min(reste à répartir, reste dû)`.
 * Montant supérieur au total dû → `amount_exceeds_remaining` avec `maxAmount` (trop-perçu refusé en V1).
 */
export function proposeAllocation(amount: number, installments: readonly LedgerInstallment[]): Allocation[] {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new DomainError('invalid_amount', { amount });
  installments.forEach(assertInstallment);
  const open = installments.filter(isOpen).sort(byDueOrder);
  const maxAmount = open.reduce((total, x) => total + remainingOf(x), 0);
  if (amount > maxAmount) throw new DomainError('amount_exceeds_remaining', { maxAmount });

  const allocations: Allocation[] = [];
  let left = amount;
  for (const x of open) {
    if (left === 0) break;
    const part = Math.min(left, remainingOf(x));
    allocations.push({ installmentId: x.id, amount: part });
    left -= part;
  }
  return allocations;
}

export type AllocationIssue =
  | { code: 'invalid_amount' }
  | { code: 'duplicate_installment'; installmentId: string }
  | { code: 'allocation_not_positive'; installmentId: string }
  | { code: 'installment_not_open'; installmentId: string }
  | { code: 'allocation_exceeds_remaining'; installmentId: string; remaining: number }
  | { code: 'mixed_enrollments' }
  | { code: 'allocation_mismatch'; expected: number; allocated: number };

export interface ValidationResult {
  ok: boolean;
  /** Toutes les erreurs, sans arrêt à la première (§ 5). */
  errors: AllocationIssue[];
  /** Compteur « Reste à répartir » de l'interface, jamais négatif. */
  remainingToAllocate: number;
}

/**
 * Échéances vues par la validation d'un paiement par le gestionnaire (§ 5, architecture/04-flows § 4.5) :
 * `amountPending` sans les allocations proposées de ce paiement.
 */
export function excludingPayment(
  installments: readonly LedgerInstallment[],
  paymentAllocations: readonly Allocation[],
): LedgerInstallment[] {
  const own = new Map<string, number>();
  for (const a of paymentAllocations) own.set(a.installmentId, (own.get(a.installmentId) ?? 0) + a.amount);
  return installments.map((x) => {
    const mine = own.get(x.id) ?? 0;
    if (mine > x.amountPending) throw new DomainError('invalid_amount', { installmentId: x.id });
    return mine === 0 ? x : { ...x, amountPending: x.amountPending - mine };
  });
}

export interface ValidateOptions {
  /** Inscription du paiement : une allocation sur une autre inscription → `mixed_enrollments`. */
  enrollmentId?: string;
}

/**
 * Contrôle d'une répartition (§ 5). Σ réparti = somme des allocations dont le montant est un entier positif
 * (doublons et échéances fermées compris : ils ont déjà leur propre erreur).
 * À la validation par un gestionnaire, `amountPending` des échéances exclut les allocations du paiement en cours.
 */
export function validateAllocation(
  amount: number,
  allocations: readonly Allocation[],
  installments: readonly LedgerInstallment[],
  options: ValidateOptions = {},
): ValidationResult {
  // Données d'échéance corrompues (montant décimal, négatif) : erreur levée, ce n'est pas une saisie à corriger.
  installments.forEach(assertInstallment);
  const errors: AllocationIssue[] = [];
  const amountOk = Number.isSafeInteger(amount) && amount > 0;
  if (!amountOk) errors.push({ code: 'invalid_amount' });

  const byId = new Map(installments.map((x) => [x.id, x]));
  const seen = new Set<string>();
  const enrollments = new Set<string>(options.enrollmentId === undefined ? [] : [options.enrollmentId]);
  let allocated = 0;
  for (const { installmentId, amount: part } of allocations) {
    const positive = Number.isSafeInteger(part) && part > 0;
    if (positive) allocated += part;
    if (seen.has(installmentId)) {
      errors.push({ code: 'duplicate_installment', installmentId });
      continue;
    }
    seen.add(installmentId);
    if (!positive) {
      errors.push({ code: 'allocation_not_positive', installmentId });
      continue;
    }
    const x = byId.get(installmentId);
    if (!x || !isOpen(x)) {
      errors.push({ code: 'installment_not_open', installmentId });
      continue;
    }
    enrollments.add(x.enrollmentId);
    const remaining = remainingOf(x);
    if (part > remaining) errors.push({ code: 'allocation_exceeds_remaining', installmentId, remaining });
  }
  if (enrollments.size > 1) errors.push({ code: 'mixed_enrollments' });
  if (amountOk && allocated !== amount) errors.push({ code: 'allocation_mismatch', expected: amount, allocated });

  return { ok: errors.length === 0, errors, remainingToAllocate: amountOk ? Math.max(0, amount - allocated) : 0 };
}
