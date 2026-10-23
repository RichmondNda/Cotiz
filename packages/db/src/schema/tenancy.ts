import {
  boolean,
  char,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, version } from '../columns.js';
import { files } from './files.js';

// Module tenancy (docs/specs/schema.sql, lot 1.2 ; migration 0006). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const associationsStatus = pgEnum('associations_status', [
  'onboarding',
  'active',
  'past_due',
  'suspended',
  'closed',
]);
export const associationPaymentMethodsKind = pgEnum('association_payment_methods_kind', [
  'bank_transfer',
  'mobile_money',
  'cash',
  'other',
]);

/**
 * Le client de Cotiz, racine de l'isolation. RLS : l'association elle-même (tenant_self), ses membres actifs dans les
 * espaces subscriber et auth (member_read), le worker (system_read).
 */
export const associations = pgTable('associations', {
  id: id(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  city: text('city').notNull(),
  country: text('country').notNull(),
  /** Facultatif, repris de la demande (lot 1.3). */
  registrationNumber: text('registration_number'),
  description: text('description'),
  logoFileId: uuid('logo_file_id').references((): AnyPgColumn => files.id),
  contactEmail: text('contact_email').notNull(),
  contactPhone: text('contact_phone').notNull(),
  status: associationsStatus('status').notNull().default('onboarding'),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspensionReason: text('suspension_reason'),
  currency: char('currency', { length: 3 }).notNull().default('XOF'),
  timezone: text('timezone').notNull().default('Africa/Abidjan'),
  /** Délai avant « en retard ». */
  defaultGraceDays: integer('default_grace_days').notNull().default(5),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  version: version(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Comment les souscripteurs paient l'association. RLS : l'association, ses membres actifs (member_read). */
export const associationPaymentMethods = pgTable('association_payment_methods', {
  id: id(),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  kind: associationPaymentMethodsKind('kind').notNull(),
  /** « Orange Money », « SGBCI »… */
  label: text('label').notNull(),
  /** IBAN, banque, opérateur, numéro : schéma validé par type. */
  details: jsonb('details').notNull().default({}),
  instructions: text('instructions'),
  position: integer('position').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});
