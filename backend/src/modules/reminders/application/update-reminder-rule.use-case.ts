import { Injectable } from '@nestjs/common';
import type { ReminderRule } from '@cotiz/contracts';
import { reminderRules } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { saveManualTemplate } from '../../notifications/notifications.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { RuleInput } from '../domain/reminder-rule.js';
import { messageOf, RULE_TEMPLATE_KEY, ruleOf, toReminderRule } from './reminder-rule-records.js';
import { assertValidRule } from './rule-checks.js';

/**
 * rm.rules › patch : modification partielle d'une règle (activation, déclencheur, canaux, message, projet). La règle
 * complète est recontrôlée ; un nouveau texte ajoute une version du modèle. Règle d'une autre association : 404.
 * Fonctionnalité `auto_reminders` exigée. Audité (`reminder_rule.update`).
 */
@Injectable()
export class UpdateReminderRuleUseCase {
  @Audited('reminder_rule.update')
  async execute(aid: string, id: string, patch: Partial<RuleInput>): Promise<z.infer<typeof ReminderRule>> {
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'auto_reminders');
    const row = await ruleOf(associationId, id);
    if (!row) throw new DomainProblem('not_found');
    const current = toReminderRule(row, await messageOf(associationId, row));
    const next: RuleInput = {
      projectId: current.projectId,
      trigger: current.trigger,
      offsetDays: current.offsetDays,
      channels: current.channels,
      message: current.message,
      isActive: current.isActive,
      ...patch,
    };
    await assertValidRule(associationId, next);
    const templateId =
      next.message === current.message && row.templateId
        ? row.templateId
        : await saveManualTemplate({
            associationId,
            key: RULE_TEMPLATE_KEY,
            body: next.message,
            previousId: row.templateId,
          });
    const [updated] = await currentTx()
      .update(reminderRules)
      .set({
        projectId: next.projectId,
        trigger: next.trigger,
        offsetDays: next.offsetDays,
        channels: [...next.channels],
        templateId,
        isActive: next.isActive,
      })
      .where(eq(reminderRules.id, row.id))
      .returning();
    if (!updated) throw new DomainProblem('not_found');
    const rule = toReminderRule(updated, next.message);
    recordAudit({ entityType: 'reminder_rule', entityId: row.id, before: { ...current }, after: { ...rule } });
    return rule;
  }
}
