import type { ReminderRule } from '@cotiz/contracts';
import { reminderRules } from '@cotiz/db';
import { and, asc, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { ruleTemplateBodiesOf } from '../infra/rule-templates.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type ReminderRuleRow = typeof reminderRules.$inferSelect;

/** Clé des modèles de message des règles (message_templates, canal `manual`). */
export const RULE_TEMPLATE_KEY = 'reminder.rule';

export function toReminderRule(row: ReminderRuleRow, message: string): z.infer<typeof ReminderRule> {
  return {
    id: row.id,
    projectId: row.projectId,
    trigger: row.trigger,
    offsetDays: row.offsetDays,
    channels: row.channels as z.infer<typeof ReminderRule>['channels'],
    message,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Règles de l'association du contexte, avec leur message, dans l'ordre de création. */
export async function rulesWithMessagesOf(associationId: string): Promise<{ row: ReminderRuleRow; message: string }[]> {
  const rows = await currentTx()
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.associationId, associationId))
    .orderBy(asc(reminderRules.createdAt), asc(reminderRules.id));
  const bodies = await ruleTemplateBodiesOf(
    associationId,
    rows.flatMap((r) => (r.templateId ? [r.templateId] : [])),
  );
  return rows.map((row) => ({ row, message: (row.templateId && bodies.get(row.templateId)) ?? '' }));
}

/** Une règle de l'association (verrouillée pour une modification) ; `null` si elle n'existe pas ou n'est pas la sienne. */
export async function ruleOf(associationId: string, id: string): Promise<ReminderRuleRow | null> {
  const [row] = await currentTx()
    .select()
    .from(reminderRules)
    .where(and(eq(reminderRules.associationId, associationId), eq(reminderRules.id, id)))
    .for('no key update');
  return row ?? null;
}

/** Message d'une règle (texte de son modèle) ; vide si elle n'en a pas. */
export async function messageOf(associationId: string, row: ReminderRuleRow): Promise<string> {
  if (!row.templateId) return '';
  return (await ruleTemplateBodiesOf(associationId, [row.templateId])).get(row.templateId) ?? '';
}
