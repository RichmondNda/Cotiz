import { bigint, char, date, integer, pgMaterializedView, timestamp, uuid } from 'drizzle-orm/pg-core';
import { subscriptionsBillingPeriod } from './billing.js';

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
