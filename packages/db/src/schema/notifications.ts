import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { users } from './identity.js';
import { associations } from './tenancy.js';

// Module notifications (docs/specs/schema.sql, lot 2.5 ; migration 0014). Valeurs des enums : celles du schéma cible.
export const deliveryChannel = pgEnum('delivery_channel', ['push', 'email', 'sms']);
export const deliveriesStatus = pgEnum('deliveries_status', ['queued', 'sent', 'delivered', 'failed', 'bounced']);

/**
 * Notification in-app, affichée dans la cloche. RLS : la personne destinataire (owner_access) et le worker
 * (system_access). Titre et texte rendus à la création ; `dedupeKey` unique rend la création rejouable.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    associationId: uuid('association_id').references(() => associations.id),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    actionUrl: text('action_url'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
    dedupeKey: text('dedupe_key').unique(),
  },
  (t) => [
    index('notifications_unread')
      .on(t.userId, t.createdAt.desc())
      .where(sql`${t.readAt} IS NULL`),
  ],
);

/** Chaque envoi réel sur un canal externe (push au lot 4.2, email et SMS au groupe 6) : vide en V1. */
export const deliveries = pgTable('deliveries', {
  id: id(),
  userId: uuid('user_id').notNull(),
  associationId: uuid('association_id').references(() => associations.id),
  notificationId: uuid('notification_id'),
  channel: deliveryChannel('channel').notNull(),
  provider: text('provider').notNull(),
  providerMessageId: text('provider_message_id'),
  recipientMasked: text('recipient_masked').notNull(),
  status: deliveriesStatus('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  costUnits: integer('cost_units'),
  createdAt: createdAt(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
});

// Lot 4.2 (migration 0023) : préférences, modèles de messages, abonnements Web Push.
export const notificationChannel = pgEnum('notification_channel', ['in_app', 'push', 'email', 'sms']);
export const templateChannel = pgEnum('template_channel', ['in_app', 'push', 'email', 'sms', 'manual']);

/** Choix de canal par type et par personne. RLS : owner_access (la personne) et system_access (worker). */
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    userId: uuid('user_id').notNull(),
    type: text('type').notNull(),
    channel: notificationChannel('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type, t.channel] })],
);

/**
 * Modèles de messages versionnés. `associationId` NULL : modèle de la plateforme, lisible par tous (écrit par
 * cotiz_platform) ; sinon lu et écrit dans le seul contexte de l'association (tenant_templates).
 */
export const messageTemplates = pgTable('message_templates', {
  id: id(),
  associationId: uuid('association_id').references(() => associations.id),
  key: text('key').notNull(),
  channel: templateChannel('channel').notNull(),
  locale: text('locale').notNull().default('fr-CI'),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  version: integer('version').notNull().default(1),
  createdAt: createdAt(),
});

/** Abonnements Web Push d'une personne (un par appareil). Désactivé après 5 échecs ou une réponse 404/410. */
export const pushSubscriptions = pgTable('push_subscriptions', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  endpoint: text('endpoint').notNull().unique(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  failedCount: integer('failed_count').notNull().default(0),
  createdAt: createdAt(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
