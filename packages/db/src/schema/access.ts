import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, unique, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { users } from './identity.js';
import { associations } from './tenancy.js';

// Module access (docs/specs/schema.sql) : personnel de la plateforme (lot 1.1 ; migration 0004), appartenances
// (lot 1.2 ; migration 0006).
export const platformStaffRole = pgEnum('platform_staff_role', ['owner', 'admin', 'support']);
export const membershipsRole = pgEnum('memberships_role', ['owner', 'manager', 'viewer', 'subscriber']);
export const membershipsStatus = pgEnum('memberships_status', ['invited', 'active', 'removed']);

/** Personnel de la plateforme Cotiz. Table globale sans RLS. */
export const platformStaff = pgTable('platform_staff', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  role: platformStaffRole('role').notNull(),
  createdAt: createdAt(),
});

/**
 * Lien entre une personne et une association, avec son rôle ; un souscripteur dans deux associations = deux lignes.
 * RLS : l'association (tenant_isolation), la personne elle-même dans les espaces subscriber et auth (self_read).
 */
export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references((): AnyPgColumn => associations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    role: membershipsRole('role').notNull(),
    status: membershipsStatus('status').notNull().default('invited'),
    /** Fonction affichée (« Trésorière »), facultative. */
    title: text('title'),
    invitedBy: uuid('invited_by').references(() => users.id),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
    removedAt: timestamp('removed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.associationId, t.userId, t.role),
    index('memberships_user')
      .on(t.userId)
      .where(sql`${t.status} = 'active'`),
  ],
);
