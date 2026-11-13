import {
  bigint,
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgMaterializedView,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { subscriptionsBillingPeriod } from './billing.js';
import { users } from './identity.js';
import { associations } from './tenancy.js';

// Module reporting (docs/specs/schema.sql, lot 1.4 ; migration 0009). Vues matérialisées des statistiques plateforme,
// définies en SQL par la migration (`.existing()`) : lues par cotiz_platform, rafraîchies par refresh_platform_stats().

/** Associations actives à la fin de chacun des 12 derniers mois (premier jour du mois). */
export const statsActiveAssociationsByMonth = pgMaterializedView('stats_active_associations_by_month', {
  month: date('month', { mode: 'string' }).notNull(),
  count: integer('count').notNull(),
}).existing();

/** Associations non fermées par plan affiché. */
export const statsAssociationsByPlan = pgMaterializedView('stats_associations_by_plan', {
  planId: uuid('plan_id').notNull(),
  count: integer('count').notNull(),
}).existing();

/** Compteurs du tableau de bord plateforme (une ligne). */
export const statsPlatformKpi = pgMaterializedView('stats_platform_kpi', {
  id: integer('id').notNull(),
  activeAssociations: integer('active_associations').notNull(),
  newAssociationsThisMonth: integer('new_associations_this_month').notNull(),
  totalAssociations: integer('total_associations').notNull(),
  subscriptionsUpToDate: integer('subscriptions_up_to_date').notNull(),
  subscriptionsUnpaid: integer('subscriptions_unpaid').notNull(),
  refreshedAt: timestamp('refreshed_at', { withTimezone: true }).notNull(),
}).existing();

/** Abonnements facturés (actifs ou impayés) par période et prix : base du revenu mensuel récurrent. */
export const statsRecurringRevenue = pgMaterializedView('stats_recurring_revenue', {
  billingPeriod: subscriptionsBillingPeriod('billing_period').notNull(),
  price: bigint('price', { mode: 'bigint' }).notNull(),
  currency: char('currency', { length: 3 }).notNull(),
  count: integer('count').notNull(),
}).existing();

// Lot 4.6 (migration 0027) : exports asynchrones et statistiques d'usage.
export const exportJobsKind = pgEnum('export_jobs_kind', ['project_report_csv', 'project_report_pdf', 'members_csv']);
export const exportJobsStatus = pgEnum('export_jobs_status', ['queued', 'running', 'done', 'failed']);

/** Export demandé par un gestionnaire. RLS : l'association (tenant_isolation). */
export const exportJobs = pgTable('export_jobs', {
  id: id(),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  requestedBy: uuid('requested_by')
    .notNull()
    .references(() => users.id),
  kind: exportJobsKind('kind').notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  status: exportJobsStatus('status').notNull().default('queued'),
  /** Fichier produit (compartiment cotiz-exports, expiration 7 jours). */
  fileId: uuid('file_id'),
  createdAt: createdAt(),
});

/**
 * Agrégats quotidiens d'usage par association (écran super-admin). RLS : l'association (tenant_isolation), le worker
 * (system_access, tâche usage.daily). `avg_validation_hours` : indicateur en heures, jamais un montant.
 */
export const usageDaily = pgTable(
  'usage_daily',
  {
    associationId: uuid('association_id').notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    logins: integer('logins').notNull(),
    activeUsers: integer('active_users').notNull(),
    paymentsDeclared: integer('payments_declared').notNull(),
    paymentsValidated: integer('payments_validated').notNull(),
    avgValidationHours: numeric('avg_validation_hours').notNull(),
  },
  (t) => [primaryKey({ columns: [t.associationId, t.day] })],
);
