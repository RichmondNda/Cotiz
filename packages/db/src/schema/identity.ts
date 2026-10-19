import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  inet,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createdAt, id, updatedAt, version } from '../columns.js';
import { associations } from './tenancy.js';

// Module identity (docs/specs/schema.sql, lot 1.1 ; migration 0004). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const usersStatus = pgEnum('users_status', ['pending_activation', 'active', 'locked', 'disabled', 'anonymized']);
export const sessionsSpace = pgEnum('sessions_space', ['platform', 'association', 'subscriber']);
export const oneTimeCodesPurpose = pgEnum('one_time_codes_purpose', [
  'activation',
  'password_reset',
  'staff_invite',
  'team_invite',
]);
export const oneTimeCodesDelivery = pgEnum('one_time_codes_delivery', ['manual', 'sms', 'email']);
export const passwordResetRequestsSpace = pgEnum('password_reset_requests_space', [
  'association',
  'subscriber',
  'platform',
]);
export const passwordResetRequestsStatus = pgEnum('password_reset_requests_status', [
  'pending',
  'code_issued',
  'completed',
  'expired',
  'dismissed',
]);

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });

/** Toute personne qui se connecte. Table globale sans RLS : accès limité au module identity. */
export const users = pgTable('users', {
  id: id(),
  phoneE164: text('phone_e164').unique(),
  email: citext('email').unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  status: usersStatus('status').notNull().default('pending_activation'),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  locale: text('locale').notNull().default('fr-CI'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  anonymizedAt: timestamp('anonymized_at', { withTimezone: true }),
  version: version(),
});

/** Secrets d'authentification, séparés de l'identité. */
export const credentials = pgTable('credentials', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id),
  /** argon2id ; `null` tant que le compte n'est pas activé. */
  passwordHash: text('password_hash'),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

/** Sessions de connexion : le jeton de rafraîchissement n'y est jamais, seulement son SHA-256. */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    familyId: uuid('family_id').notNull(),
    space: sessionsSpace('space').notNull(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** « Rester connecté » : cookie persistant sinon de session, recopié à chaque rotation. */
    rememberMe: boolean('remember_me').notNull().default(false),
  },
  (t) => [
    uniqueIndex('sessions_refresh_token').on(t.refreshTokenHash),
    index('sessions_family').on(t.familyId),
    index('sessions_user_active')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/** Codes remis par une personne (architecture/03-auth.md). RLS : association émettrice, espaces auth et system. */
export const oneTimeCodes = pgTable(
  'one_time_codes',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    purpose: oneTimeCodesPurpose('purpose').notNull(),
    delivery: oneTimeCodesDelivery('delivery').notNull().default('manual'),
    /** argon2id, jamais le code. */
    codeHash: text('code_hash').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    /** Association émettrice ; `null` si émis par la plateforme. */
    associationId: uuid('association_id').references((): AnyPgColumn => associations.id),
    /** Activation d'un souscripteur seulement (AES-256-GCM) ; effacé à la consommation ou l'expiration. */
    codeEncrypted: bytea('code_encrypted'),
    issuedBy: uuid('issued_by').references(() => users.id),
    handedAt: timestamp('handed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('codes_pending')
      .on(t.associationId, t.purpose)
      .where(sql`${t.consumedAt} IS NULL`),
  ],
);

/** Demandes « mot de passe oublié », traitées par le rôle supérieur. RLS comme one_time_codes. */
export const passwordResetRequests = pgTable(
  'password_reset_requests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    /** Association qui traite la demande (souscripteur) ; `null` = plateforme (gestionnaires). */
    associationId: uuid('association_id').references((): AnyPgColumn => associations.id),
    space: passwordResetRequestsSpace('space').notNull(),
    status: passwordResetRequestsStatus('status').notNull().default('pending'),
    codeId: uuid('code_id').references(() => oneTimeCodes.id),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
  },
  (t) => [
    index('resets_pending')
      .on(t.associationId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);
