import { pgEnum, pgTable, uuid } from 'drizzle-orm/pg-core';
import { createdAt } from '../columns.js';
import { users } from './identity.js';

// Module access (docs/specs/schema.sql, lot 1.1 ; migration 0004). Les appartenances (memberships) arrivent au lot 1.2.
export const platformStaffRole = pgEnum('platform_staff_role', ['owner', 'admin', 'support']);

/** Personnel de la plateforme Cotiz. Table globale sans RLS. */
export const platformStaff = pgTable('platform_staff', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  role: platformStaffRole('role').notNull(),
  createdAt: createdAt(),
});
