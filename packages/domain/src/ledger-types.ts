import type { IsoDate } from './dates.js';
import type { InstallmentKind } from './schedule.js';

// Formes communes au registre (montants en plus petite unité de la devise du projet, entiers).

export type InstallmentStatus = 'upcoming' | 'due' | 'declared' | 'partial' | 'paid' | 'late' | 'waived' | 'canceled';
export type EnrollmentStatus = 'pending_signature' | 'active' | 'withdrawn' | 'completed';
export type MemberStanding = 'signature_required' | 'up_to_date' | 'late' | 'withdrawn' | 'activation_pending';

/** Ce que `installmentStatus` lit d'une échéance. */
export interface InstallmentState {
  dueDate: IsoDate;
  amountDue: number;
  amountPaid: number;
  /** Allocations proposées de paiements en attente. */
  amountPending: number;
  /** Statut persisté (seuls `waived` et `canceled` sont conservés tels quels). */
  status: InstallmentStatus;
  /**
   * Départ du retard s'il est postérieur à l'échéance (`installments.late_from`) : échéances déjà passées quand le
   * contrat est signé, datées de la signature (domain-rules § 6). `null` : le retard part de l'échéance.
   */
  lateFrom: IsoDate | null;
}

/** Échéance vue par la répartition. */
export interface LedgerInstallment extends InstallmentState {
  id: string;
  enrollmentId: string;
  kind: InstallmentKind;
  sequence: number;
}

export interface Allocation {
  installmentId: string;
  amount: number;
}
