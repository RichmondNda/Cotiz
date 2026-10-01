import { z } from 'zod';
import { InstallmentKind, InstallmentStatus, MemberStanding, PaymentStatus } from '../common/enums.js';
import {
  AllocationInput,
  CoveredInstallment,
  Installment,
  PaymentSummary,
  Rejection,
  RejectionReason,
} from '../common/ledger.js';
import { listOf, ListQuery } from '../common/list.js';
import { AssociationParams, ProjectParams } from '../common/params.js';
import { PaymentMethod } from '../common/payment-method.js';
import { PersonRef } from '../common/people.js';
import { ProjectRef } from '../common/project.js';
import { Instant, IsoDate, Money, Uuid } from '../common/scalars.js';
import { defineEndpoint, noFlags } from '../registry.js';

// Registre : grille, échéances, file de validation (docs/ui/manager.md ; architecture/04-flows.md § 4.5).

const read = 'association.read';
const review = 'payments.review';

// ---------------------------------------------------------------- Grille

export const GridColumn = z.object({ sequence: z.int().nonnegative(), kind: InstallmentKind, dueDate: IsoDate });

export const GridCell = z.object({
  installmentId: Uuid,
  sequence: z.int().nonnegative(),
  status: InstallmentStatus,
  amountDue: Money,
  amountPaid: Money,
  amountPending: Money,
});

export const GridRow = z.object({
  enrollmentId: Uuid,
  member: PersonRef,
  standing: MemberStanding,
  remaining: Money,
  /** Une case par colonne où le souscripteur a une échéance (absente avant sa date d'entrée). */
  cells: z.array(GridCell),
});

export const Grid = listOf(GridRow).extend({
  /** Colonnes communes à tous les souscripteurs (numérotation du projet). */
  columns: z.array(GridColumn),
});

export const lgGrid = defineEndpoint({
  id: 'lg.grid',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/projects/{pid}/grid',
      request: {
        params: ProjectParams,
        query: ListQuery.extend({
          q: z.string().min(1).optional(),
          standing: MemberStanding.optional(),
          /** Période affichée (dates d'échéance). */
          from: IsoDate.optional(),
          to: IsoDate.optional(),
        }),
      },
      response: { status: 200, body: Grid },
    },
  },
});

export const InstallmentDetail = z.object({
  installment: Installment,
  member: PersonRef,
  project: ProjectRef,
  allocations: z.array(
    z.object({
      paymentId: Uuid,
      amount: Money,
      state: CoveredInstallment.shape.state,
      paymentStatus: PaymentStatus,
      paidOn: IsoDate,
      declaredAt: Instant,
    }),
  ),
});

export const lgInst = defineEndpoint({
  id: 'lg.inst',
  space: 'association',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/installments/{iid}',
      request: { params: AssociationParams.extend({ iid: Uuid }) },
      response: { status: 200, body: InstallmentDetail },
    },
  },
});

// ---------------------------------------------------------------- Paiements

export const PaymentsQuery = ListQuery.extend({
  /** File de validation par défaut ; `all` pour tous les statuts. */
  status: z.union([PaymentStatus, z.literal('all')]).default('pending'),
  projectId: Uuid.optional(),
  userId: Uuid.optional(),
  /** Déclarés depuis au moins N jours (filtre d'ancienneté). */
  olderThanDays: z.coerce.number().int().min(0).optional(),
  minAmount: z.coerce.number().int().min(0).optional(),
  maxAmount: z.coerce.number().int().min(0).optional(),
});

export const lgPayList = defineEndpoint({
  id: 'lg.pay.list',
  space: 'association',
  permission: read,
  errors: [],
  flags: noFlags,
  operations: {
    list: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/payments',
      request: { params: AssociationParams, query: PaymentsQuery },
      response: { status: 200, body: listOf(PaymentSummary) },
    },
  },
});

export const PaymentDetail = PaymentSummary.extend({
  paymentMethod: PaymentMethod.nullable(),
  comment: z.string().nullable(),
  /** Vrai si le gestionnaire a modifié la répartition proposée. */
  allocationAdjusted: z.boolean(),
  rejection: Rejection.nullable(),
  /** Échéancier du souscripteur sur le projet (situation, ajustement de la répartition). */
  schedule: z.array(Installment),
  /** 3 derniers paiements validés du souscripteur sur le projet, hors celui-ci. */
  recentPayments: z.array(PaymentSummary).max(3),
  /** Annulation possible par l'auteur de la validation jusqu'à cet instant (10 min). */
  revertibleUntil: Instant.nullable(),
  version: z.int().min(1),
}).meta({ id: 'PaymentDetail' });
export type PaymentDetail = z.infer<typeof PaymentDetail>;

export const PaymentParams = AssociationParams.extend({ payId: Uuid });

export const lgPayGet = defineEndpoint({
  id: 'lg.pay.get',
  space: 'association',
  permission: read,
  errors: ['not_found'],
  flags: noFlags,
  operations: {
    get: {
      method: 'GET',
      path: '/api/v1/associations/{aid}/payments/{payId}',
      request: { params: PaymentParams },
      response: { status: 200, body: PaymentDetail },
    },
  },
});

export const ValidatePaymentInput = z.object({
  /** Répartition ajustée ; celle du souscripteur si absente. */
  allocations: z.array(AllocationInput).min(1).optional(),
  /** « Le montant reçu est différent ». */
  amountReceived: Money.optional(),
});

export const lgPayValidate = defineEndpoint({
  id: 'lg.pay.validate',
  space: 'association',
  permission: review,
  errors: ['payment_already_reviewed', 'allocation_mismatch', 'amount_exceeds_remaining', 'version_conflict'],
  flags: { idempotencyKey: true, ifMatch: true, rateLimited: false, audited: true },
  operations: {
    validate: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/payments/{payId}/validate',
      request: { params: PaymentParams, body: ValidatePaymentInput },
      response: { status: 200, body: PaymentDetail },
    },
  },
});

export const RejectPaymentInput = z.object({
  reasonCode: RejectionReason,
  /** Message transmis au souscripteur. */
  message: z.string().max(1000).optional(),
});

export const lgPayReject = defineEndpoint({
  id: 'lg.pay.reject',
  space: 'association',
  permission: review,
  errors: ['payment_already_reviewed', 'version_conflict'],
  flags: { idempotencyKey: true, ifMatch: true, rateLimited: false, audited: true },
  operations: {
    reject: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/payments/{payId}/reject',
      request: { params: PaymentParams, body: RejectPaymentInput },
      response: { status: 200, body: PaymentDetail },
    },
  },
});

export const lgPayRevert = defineEndpoint({
  id: 'lg.pay.revert',
  space: 'association',
  permission: review,
  errors: ['revert_window_expired', 'not_reviewer', 'invalid_state'],
  flags: { ...noFlags, idempotencyKey: true, audited: true },
  operations: {
    /** Opération compensatoire : le paiement repasse `pending`. */
    revert: {
      method: 'POST',
      path: '/api/v1/associations/{aid}/payments/{payId}/revert-validation',
      request: { params: PaymentParams },
      response: { status: 200, body: PaymentDetail },
    },
  },
});
