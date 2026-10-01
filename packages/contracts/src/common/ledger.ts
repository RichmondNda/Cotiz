import { z } from 'zod';
import { AllocationState, InstallmentKind, InstallmentStatus, PaymentStatus } from './enums.js';
import { PersonRef } from './people.js';
import { ProjectRef } from './project.js';
import { Instant, IsoDate, Money, Uuid } from './scalars.js';

/** Échéance : une case de la grille (fonds d'entrée `sequence = 0`, puis 1, 2…). */
export const Installment = z.object({
  id: Uuid,
  enrollmentId: Uuid,
  projectId: Uuid,
  kind: InstallmentKind,
  sequence: z.int().nonnegative(),
  dueDate: IsoDate,
  amountDue: Money,
  amountPaid: Money,
  /** Allocations proposées de paiements en attente. */
  amountPending: Money,
  /** `amountDue − amountPaid − amountPending`. */
  remaining: Money,
  status: InstallmentStatus,
  lateSince: IsoDate.nullable(),
  paidAt: Instant.nullable(),
});
export type Installment = z.infer<typeof Installment>;

/** Échéance couverte par un paiement (« Couvre : sept., oct. 2026 »). */
export const CoveredInstallment = z.object({
  installmentId: Uuid,
  kind: InstallmentKind,
  sequence: z.int().nonnegative(),
  dueDate: IsoDate,
  amount: Money,
  state: AllocationState,
});

/** Répartition saisie (déclaration, ajustement à la validation). */
export const AllocationInput = z.object({ installmentId: Uuid, amount: Money });
export type AllocationInput = z.infer<typeof AllocationInput>;

export const PaymentProof = z.object({
  fileId: Uuid.nullable(),
  transactionReference: z.string().nullable(),
});

export const PaymentSummary = z.object({
  id: Uuid,
  status: PaymentStatus,
  amountDeclared: Money,
  /** Saisi par le gestionnaire si le montant reçu diffère. */
  amountReceived: Money.nullable(),
  paidOn: IsoDate,
  declaredAt: Instant,
  member: PersonRef,
  project: ProjectRef,
  covered: z.array(CoveredInstallment),
  proof: PaymentProof,
  reviewedBy: PersonRef.nullable(),
  reviewedAt: Instant.nullable(),
});
export type PaymentSummary = z.infer<typeof PaymentSummary>;

/** Motifs de rejet proposés dans la modale. */
export const RejectionReason = z.enum(['unreadable_proof', 'not_received', 'amount_mismatch', 'other']);

export const Rejection = z.object({ reasonCode: RejectionReason, message: z.string().nullable() });
