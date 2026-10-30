import { DomainError } from './errors.js';
import type { InstallmentStatus } from './ledger-types.js';
import type { ScheduleType } from './schedule.js';

// Totaux d'une inscription (Enrollment : paid, remaining, lateAmount, commitment ; onglet Souscripteurs, fiche).
// Montants en plus petite unité de la devise du projet (entiers) ; la devise est portée par l'appelant.

/** Ce que les totaux lisent d'une échéance ; `status` : statut calculé (`installmentStatus`). */
export interface TotalsInstallment {
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
}

export interface EnrollmentTotals {
  /** Versé sur les échéances qui comptent. */
  paid: number;
  /** Dû restant : échéances qui comptent moins le versé (une déclaration en attente n'est pas déduite). */
  remaining: number;
  /** Reste dû des échéances en retard. */
  lateAmount: number;
  /** Dates fixes : somme des échéances qui comptent ; `null` pour un cycle roulant (aucun terme). */
  commitment: number | null;
}

/** Une échéance annulée ou dispensée ne compte plus (ni due, ni versée). */
const counts = (i: TotalsInstallment) => i.status !== 'canceled' && i.status !== 'waived';

function add(total: number, value: number): number {
  const sum = total + value;
  if (!Number.isSafeInteger(sum)) throw new DomainError('invalid_amount', { value: sum });
  return sum;
}

export function enrollmentTotals(
  installments: readonly TotalsInstallment[],
  scheduleType: ScheduleType,
): EnrollmentTotals {
  let due = 0;
  let paid = 0;
  let lateAmount = 0;
  for (const i of installments) {
    for (const value of [i.amountDue, i.amountPaid]) {
      if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
    }
    if (i.amountPaid > i.amountDue) throw new DomainError('invalid_amount', { value: i.amountPaid });
    if (!counts(i)) continue;
    due = add(due, i.amountDue);
    paid = add(paid, i.amountPaid);
    if (i.status === 'late') lateAmount = add(lateAmount, i.amountDue - i.amountPaid);
  }
  return { paid, remaining: due - paid, lateAmount, commitment: scheduleType === 'fixed' ? due : null };
}
