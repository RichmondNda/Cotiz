import { date, foreignKey, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { users } from './identity.js';
import { projects } from './projects.js';
import { associations } from './tenancy.js';

// Module members (docs/specs/schema.sql, lot 2.3 ; migration 0012). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const enrollmentsStatus = pgEnum('enrollments_status', [
  'pending_signature',
  'active',
  'withdrawn',
  'completed',
]);

/**
 * Informations complémentaires d'une personne en tant que souscripteur. Globale, sans RLS (comme users) : accès
 * limité au module members.
 */
export const subscriberProfiles = pgTable('subscriber_profiles', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  address: text('address'),
  city: text('city'),
  /** Association qui a créé le compte, pour traçabilité. */
  createdByAssociationId: uuid('created_by_association_id'),
  createdAt: createdAt(),
});

/**
 * Participation d'une personne à un projet. RLS : l'association, le souscripteur sur ses lignes (espace subscriber),
 * le worker. Le projet est de l'association de la ligne (clé composite).
 */
export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    projectId: uuid('project_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    status: enrollmentsStatus('status').notNull().default('pending_signature'),
    /** Date d'entrée : première échéance générée à partir de cette date. */
    startsFrom: date('starts_from', { mode: 'string' }).notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
    withdrawnAt: timestamp('withdrawn_at', { withTimezone: true }),
    withdrawnBy: uuid('withdrawn_by').references(() => users.id),
    withdrawReason: text('withdraw_reason'),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.projectId, t.userId),
    /** Cible de la clé composite des échéances. */
    unique().on(t.id, t.associationId, t.projectId, t.userId),
    foreignKey({ columns: [t.projectId, t.associationId], foreignColumns: [projects.id, projects.associationId] }),
  ],
);
