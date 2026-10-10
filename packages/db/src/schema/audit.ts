import { bigserial, index, inet, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Journal d'audit, en ajout seul (docs/specs/schema.sql, lot 0.5 ; migration 0001). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role').notNull(),
    associationId: uuid('association_id'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    /** Champs modifiés uniquement. */
    before: jsonb('before').$type<Record<string, unknown>>(),
    after: jsonb('after').$type<Record<string, unknown>>(),
    requestId: text('request_id'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_entity').on(t.associationId, t.entityType, t.entityId, t.occurredAt.desc())],
);
