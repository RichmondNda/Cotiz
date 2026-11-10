import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, version } from '../columns.js';
import { files } from './files.js';
import { users } from './identity.js';
import { enrollments } from './members.js';
import { projects } from './projects.js';
import { associationPaymentMethods, associations } from './tenancy.js';

// Module ledger (docs/specs/schema.sql, lots 2.3 et 2.4 ; migrations 0012 et 0013). Valeurs des enums : celles du
// schéma cible (conformance.test.ts les compare).
export const installmentsKind = pgEnum('installments_kind', ['entry_fee', 'periodic']);
export const installmentsStatus = pgEnum('installments_status', [
  'upcoming',
  'due',
  'declared',
  'partial',
  'paid',
  'late',
  'waived',
  'canceled',
]);

/**
 * Échéance attendue (fonds d'entrée ou cotisation périodique) : une case de la grille. RLS : l'association, le
 * souscripteur sur ses lignes (espace subscriber), le worker. Montants en entiers de la devise (`bigint`) ; jamais
 * supprimée (REVOKE DELETE) ; contrôles des montants en base (installments_no_overcommit, _non_negative). Association, projet et personne sont ceux de l'inscription (clé composite).
 */
export const installments = pgTable(
  'installments',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    enrollmentId: uuid('enrollment_id').notNull(),
    /** Dénormalisé pour l'espace souscripteur. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: installmentsKind('kind').notNull(),
    /** 0 = fonds d'entrée, puis 1, 2… : rang de la date dans le projet. */
    sequence: integer('sequence').notNull(),
    /** Dans le fuseau de l'association. */
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    amountDue: bigint('amount_due', { mode: 'bigint' }).notNull(),
    amountPaid: bigint('amount_paid', { mode: 'bigint' }).notNull().default(0n),
    amountPending: bigint('amount_pending', { mode: 'bigint' }).notNull().default(0n),
    status: installmentsStatus('status').notNull().default('upcoming'),
    lateSince: date('late_since', { mode: 'string' }),
    lateFrom: date('late_from', { mode: 'string' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.enrollmentId, t.kind, t.sequence),
    /** Cible des clés composites des répartitions (lot 2.4). */
    unique().on(t.id, t.associationId, t.enrollmentId),
    foreignKey({
      columns: [t.enrollmentId, t.associationId, t.projectId, t.userId],
      foreignColumns: [enrollments.id, enrollments.associationId, enrollments.projectId, enrollments.userId],
    }),
  ],
);

export const paymentsStatus = pgEnum('payments_status', ['pending', 'validated', 'rejected', 'canceled']);
export const allocationsState = pgEnum('allocations_state', ['proposed', 'confirmed', 'voided']);

/**
 * Paiement déclaré par un souscripteur (un virement réel, hors plateforme). RLS : l'association ; le souscripteur lit
 * les siens et déclare en attente (lot 3.3). Jamais supprimé (REVOKE DELETE) ; déclaration immuable, transitions de
 * statut, paiement rejeté ou annulé figé (payments_guard) ; relecteur et motif obligatoires (payments_reviewed,
 * payments_rejection_reason) ; au COMMIT, un paiement validé a des répartitions confirmées égales au montant reçu,
 * sinon déclaré, et aucune proposition vivante (check_payment_allocations, sur payments et allocations). Association,
 * projet et personne sont ceux de l'inscription, le moyen de paiement celui de l'association (clés composites) ; la
 * preuve, une preuve de la personne ou de l'association (check_payment_proof).
 */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    enrollmentId: uuid('enrollment_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    amountDeclared: bigint('amount_declared', { mode: 'bigint' }).notNull(),
    /** Saisi par le gestionnaire si le montant reçu diffère. */
    amountReceived: bigint('amount_received', { mode: 'bigint' }),
    currency: char('currency', { length: 3 }).notNull().default('XOF'),
    /** Date du virement selon le souscripteur. */
    paidOn: date('paid_on', { mode: 'string' }).notNull(),
    paymentMethodId: uuid('payment_method_id'),
    transactionReference: text('transaction_reference'),
    /** Preuve OU référence obligatoire (payments_proof_or_reference). */
    proofFileId: uuid('proof_file_id').references(() => files.id),
    comment: text('comment'),
    status: paymentsStatus('status').notNull().default('pending'),
    declaredAt: timestamp('declared_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedBy: uuid('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    rejectionReasonCode: text('rejection_reason_code'),
    rejectionMessage: text('rejection_message'),
    /** Évite les doubles déclarations sur réseau mobile instable (unique par personne). */
    idempotencyKey: text('idempotency_key').notNull(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique().on(t.id, t.associationId, t.enrollmentId),
    unique().on(t.userId, t.idempotencyKey),
    foreignKey({
      columns: [t.enrollmentId, t.associationId, t.projectId, t.userId],
      foreignColumns: [enrollments.id, enrollments.associationId, enrollments.projectId, enrollments.userId],
    }),
    foreignKey({
      columns: [t.paymentMethodId, t.associationId],
      foreignColumns: [associationPaymentMethods.id, associationPaymentMethods.associationId],
    }),
  ],
);

/**
 * Répartition d'un paiement sur une échéance de la même inscription (clés composites, `enrollment_id` repris du
 * paiement). Ne change que d'état, vers `voided` (allocations_guard) ; une seule répartition vivante par paiement et
 * par échéance (allocations_live). Le souscripteur lit celles de ses paiements et ne fait que proposer (lot 3.3).
 */
export const allocations = pgTable(
  'allocations',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    paymentId: uuid('payment_id').notNull(),
    installmentId: uuid('installment_id').notNull(),
    enrollmentId: uuid('enrollment_id').notNull(),
    amount: bigint('amount', { mode: 'bigint' }).notNull(),
    state: allocationsState('state').notNull().default('proposed'),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({
      columns: [t.paymentId, t.associationId, t.enrollmentId],
      foreignColumns: [payments.id, payments.associationId, payments.enrollmentId],
    }),
    foreignKey({
      columns: [t.installmentId, t.associationId, t.enrollmentId],
      foreignColumns: [installments.id, installments.associationId, installments.enrollmentId],
    }),
    uniqueIndex('allocations_live')
      .on(t.paymentId, t.installmentId)
      .where(sql`${t.state} <> 'voided'`),
  ],
);
