import { index, integer, pgEnum, pgSequence, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { plans } from './billing.js';
import { users } from './identity.js';
import { associations } from './tenancy.js';

// Module onboarding (docs/specs/schema.sql, lot 1.3 ; migration 0008). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const associationRequestsEstimatedSubscribers = pgEnum('association_requests_estimated_subscribers', [
  '1_20',
  '21_50',
  '51_200',
  '201_500',
  '500_plus',
]);
export const associationRequestsStatus = pgEnum('association_requests_status', ['pending', 'approved', 'rejected']);

/** Numéro de la référence DEM-<année>-<numéro> : séquence globale, jamais remise à zéro. */
export const associationRequestNumberSeq = pgSequence('association_request_number_seq');

/**
 * Demandes de création du formulaire public. RLS : dépôt en espace public seulement (public_submit, INSERT sans
 * RETURNING) ; lecture et décision par la plateforme (cotiz_platform).
 */
export const associationRequests = pgTable(
  'association_requests',
  {
    id: id(),
    /** DEM-2026-00042, affichée sur la confirmation. */
    reference: text('reference').notNull().unique(),
    associationName: text('association_name').notNull(),
    associationType: text('association_type').notNull(),
    city: text('city').notNull(),
    country: text('country').notNull(),
    registrationNumber: text('registration_number'),
    /** 500 caractères au plus. */
    activityDescription: text('activity_description').notNull(),
    contactFirstName: text('contact_first_name').notNull(),
    contactLastName: text('contact_last_name').notNull(),
    contactTitle: text('contact_title').notNull(),
    contactEmail: text('contact_email').notNull(),
    contactPhone: text('contact_phone').notNull(),
    estimatedSubscribers: associationRequestsEstimatedSubscribers('estimated_subscribers').notNull(),
    plannedProjects: integer('planned_projects'),
    desiredPlanId: uuid('desired_plan_id').references(() => plans.id),
    acquisitionSource: text('acquisition_source'),
    /** Preuve d'acceptation des CGU. */
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }).notNull(),
    status: associationRequestsStatus('status').notNull().default('pending'),
    /** Première ouverture par la plateforme (frise « Consultée »). */
    viewedBy: uuid('viewed_by').references(() => users.id),
    viewedAt: timestamp('viewed_at', { withTimezone: true }),
    decidedBy: uuid('decided_by').references(() => users.id),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    rejectionReasonCode: text('rejection_reason_code'),
    rejectionMessage: text('rejection_message'),
    /** Jamais visible par la candidate. */
    internalNote: text('internal_note'),
    /** Association créée à l'approbation. */
    associationId: uuid('association_id').references(() => associations.id),
    createdAt: createdAt(),
  },
  (t) => [index('association_requests_queue').on(t.status, t.createdAt)],
);
