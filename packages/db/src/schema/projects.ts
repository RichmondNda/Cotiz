import {
  bigint,
  char,
  date,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, version } from '../columns.js';
import { users } from './identity.js';
import { associationPaymentMethods, associations } from './tenancy.js';

// Module projects (docs/specs/schema.sql, lot 2.2 ; migration 0011). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const projectsStatus = pgEnum('projects_status', ['draft', 'enrolling', 'active', 'completed', 'archived']);
export const projectsFrequency = pgEnum('projects_frequency', [
  'weekly',
  'monthly',
  'quarterly',
  'semiannual',
  'annual',
]);
export const projectsScheduleType = pgEnum('projects_schedule_type', ['fixed', 'rolling']);

/**
 * Un projet de cotisation. RLS : l'association (tenant_isolation), le worker (system_access, projects.activate) ; la
 * lecture par les souscripteurs inscrits arrive avec enrollments (lot 2.3). Montants en entiers de la devise
 * (`bigint`, lus par `Money.fromDb`) ; conditions financières figées dès `financialTermsLockedAt` (domain-rules § 9).
 */
export const projects = pgTable(
  'projects',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    name: text('name').notNull(),
    /** Markdown restreint. */
    description: text('description').notNull(),
    coverFileId: uuid('cover_file_id'),
    status: projectsStatus('status').notNull().default('draft'),
    /** `null` : sans limite. */
    requiredSubscribers: integer('required_subscribers'),
    /** Fonds d'entrée ; `null` : aucun. */
    entryFeeAmount: bigint('entry_fee_amount', { mode: 'bigint' }),
    installmentAmount: bigint('installment_amount', { mode: 'bigint' }).notNull(),
    frequency: projectsFrequency('frequency').notNull(),
    /** Jour du mois (1–31), jour ISO (1–7) pour `weekly`. */
    dueDay: smallint('due_day').notNull(),
    scheduleType: projectsScheduleType('schedule_type').notNull(),
    startDate: date('start_date', { mode: 'string' }).notNull(),
    /** `null` pour un cycle roulant. */
    endDate: date('end_date', { mode: 'string' }),
    graceDays: integer('grace_days').notNull().default(5),
    currency: char('currency', { length: 3 }).notNull().default('XOF'),
    financialTermsLockedAt: timestamp('financial_terms_locked_at', { withTimezone: true }),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    version: version(),
    createdAt: createdAt(),
  },
  /** Cible des clés composites de project_payment_methods. */
  (t) => [unique().on(t.id, t.associationId)],
);

/**
 * Moyens de paiement retenus pour un projet (surcharge des moyens par défaut de l'association). RLS : l'association.
 * Clés composites : projet et moyen sont de l'association de la ligne (la RLS ne contrôle que `associationId`).
 */
export const projectPaymentMethods = pgTable(
  'project_payment_methods',
  {
    projectId: uuid('project_id').notNull(),
    paymentMethodId: uuid('payment_method_id').notNull(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    instructionsOverride: text('instructions_override'),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.paymentMethodId] }),
    foreignKey({ columns: [t.projectId, t.associationId], foreignColumns: [projects.id, projects.associationId] }),
    foreignKey({
      columns: [t.paymentMethodId, t.associationId],
      foreignColumns: [associationPaymentMethods.id, associationPaymentMethods.associationId],
    }),
  ],
);
