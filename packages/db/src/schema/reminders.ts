import { boolean, date, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { users } from './identity.js';
import { messageTemplates } from './notifications.js';
import { associations } from './tenancy.js';

// Module reminders (docs/specs/schema.sql, lot 4.3 ; migration 0025).

export const reminderRulesTrigger = pgEnum('reminder_rules_trigger', ['before_due', 'on_due', 'after_due']);
export const reminderRunsKind = pgEnum('reminder_runs_kind', ['automatic', 'manual']);
export const reminderRunsStatus = pgEnum('reminder_runs_status', ['auto_sent', 'to_handle', 'handled', 'dismissed']);

/**
 * Règle de relance automatique d'une association : déclencheur (avant, le jour, après l'échéance) et décalage en jours,
 * canaux automatiques (in_app, push), message dans `message_templates` (`template_id`). `project_id` NULL = tous les
 * projets. RLS : l'association, et le worker en espace system (tâche reminders.evaluate).
 */
export const reminderRules = pgTable('reminder_rules', {
  id: id(),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  projectId: uuid('project_id'),
  trigger: reminderRulesTrigger('trigger').notNull(),
  offsetDays: integer('offset_days').notNull(),
  channels: text('channels').array().notNull(),
  templateId: uuid('template_id').references(() => messageTemplates.id),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: createdAt(),
});

/**
 * Relance d'une échéance (automatique par une règle, ou manuelle) : rappel envoyé au souscripteur (`auto_sent`), ou
 * entrée de la file « À relancer » avec le message prêt (`to_handle`, puis `handled` / `dismissed`). Unique par
 * règle, échéance et jour local de l'association (`run_date`) : un second passage le même jour n'ajoute rien.
 */
export const reminderRuns = pgTable(
  'reminder_runs',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    ruleId: uuid('rule_id'),
    installmentId: uuid('installment_id').notNull(),
    userId: uuid('user_id').notNull(),
    kind: reminderRunsKind('kind').notNull(),
    triggeredBy: uuid('triggered_by').references(() => users.id),
    createdAt: createdAt(),
    status: reminderRunsStatus('status').notNull().default('auto_sent'),
    channels: text('channels').array().notNull(),
    message: text('message'),
    handledBy: uuid('handled_by').references(() => users.id),
    handledAt: timestamp('handled_at', { withTimezone: true }),
    runDate: date('run_date', { mode: 'string' }).notNull(),
  },
  (t) => [unique().on(t.ruleId, t.installmentId, t.runDate)],
);
