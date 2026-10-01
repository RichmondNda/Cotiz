import { DomainError } from './errors.js';
import { addDays, parseIsoDate } from './dates.js';
import type { IsoDate } from './dates.js';
import type { EnrollmentStatus, InstallmentState, InstallmentStatus, MemberStanding } from './ledger-types.js';

// Statuts : domain-rules.md § 6 (échéance) et § 7 (situation d'un souscripteur). Vecteurs : status.json.

function assertGraceDays(graceDays: number): void {
  if (!Number.isInteger(graceDays) || graceDays < 0) throw new DomainError('invalid_grace_days', { graceDays });
}

/** Premier jour de retard : échéance + délai de grâce + 1 jour. */
export function lateSince(installment: Pick<InstallmentState, 'dueDate'>, graceDays: number): IsoDate {
  assertGraceDays(graceDays);
  return addDays(installment.dueDate, graceDays + 1);
}

/**
 * Statut d'une échéance au jour `today` (date dans le fuseau de l'association). Le premier cas qui s'applique gagne :
 * waived/canceled persistés, paid, declared, late, partial, due, upcoming.
 */
export function installmentStatus(installment: InstallmentState, today: IsoDate, graceDays: number): InstallmentStatus {
  parseIsoDate(today);
  parseIsoDate(installment.dueDate);
  assertGraceDays(graceDays);
  const { amountDue, amountPaid, amountPending, status } = installment;
  for (const value of [amountDue, amountPaid, amountPending]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
  }

  if (status === 'waived' || status === 'canceled') return status;
  if (amountPaid >= amountDue) return 'paid';
  if (amountPending > 0) return 'declared';
  if (today >= lateSince(installment, graceDays)) return 'late';
  if (amountPaid > 0) return 'partial';
  if (today >= installment.dueDate) return 'due';
  return 'upcoming';
}

/**
 * Situation d'un souscripteur sur un projet (§ 7). `activation_pending` est calculé par le back à partir du compte.
 */
export function memberStanding(
  enrollmentStatus: EnrollmentStatus,
  installmentStatuses: readonly InstallmentStatus[],
): Exclude<MemberStanding, 'activation_pending'> {
  switch (enrollmentStatus) {
    case 'pending_signature':
      return 'signature_required';
    case 'withdrawn':
      return 'withdrawn';
    case 'active':
    case 'completed':
      return installmentStatuses.includes('late') ? 'late' : 'up_to_date';
    default:
      throw new DomainError('invalid_status', { enrollmentStatus });
  }
}
