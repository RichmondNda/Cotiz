import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id, version } from '../columns.js';
import { associations } from './tenancy.js';

// Module billing (docs/specs/schema.sql, lot 1.2 ; migration 0007). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const subscriptionsBillingPeriod = pgEnum('subscriptions_billing_period', ['monthly', 'yearly']);
export const subscriptionsStatus = pgEnum('subscriptions_status', [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'canceled',
]);

/**
 * Formules d'abonnement gérées par le super-admin. Table globale sans RLS : module billing seulement. Montants en
 * entiers de la devise (`bigint`, lus par `Money.fromDb`) ; quotas `null` = illimité ; jamais supprimée (archivage).
 */
export const plans = pgTable('plans', {
  id: id(),
  code: text('code').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  priceMonthly: bigint('price_monthly', { mode: 'bigint' }).notNull(),
  priceYearly: bigint('price_yearly', { mode: 'bigint' }).notNull(),
  currency: char('currency', { length: 3 }).notNull().default('XOF'),
  maxProjects: integer('max_projects'),
  maxSubscribers: integer('max_subscribers'),
  maxManagers: integer('max_managers'),
  /** Clés `planGated` de features.yaml. */
  features: text('features').array().notNull(),
  isFeatured: boolean('is_featured').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  version: version(),
  createdAt: createdAt(),
});

/**
 * Abonnement d'une association. RLS : l'association (tenant_isolation), le worker (system_access). Une seule
 * souscription en cours (trialing, active, past_due) par association.
 */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    planId: uuid('plan_id')
      .notNull()
      .references(() => plans.id),
    billingPeriod: subscriptionsBillingPeriod('billing_period').notNull(),
    status: subscriptionsStatus('status').notNull().default('trialing'),
    currentPeriodStart: date('current_period_start').notNull(),
    currentPeriodEnd: date('current_period_end'),
    trialEndsAt: date('trial_ends_at'),
    /** Surcharge du nombre de comptes gestionnaires, décidée par le super-admin. */
    managerSeatsOverride: integer('manager_seats_override'),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('subscriptions_one_active')
      .on(t.associationId)
      .where(sql`${t.status} IN ('trialing', 'active', 'past_due')`),
  ],
);
