import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
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
