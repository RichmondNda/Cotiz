import { Injectable } from '@nestjs/common';
import type { ReminderRule } from '@cotiz/contracts';
import { reminderRules } from '@cotiz/db';
import type { z } from 'zod';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { saveRuleTemplate } from '../infra/rule-templates.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { RuleInput } from '../domain/reminder-rule.js';
import { RULE_TEMPLATE_KEY, toReminderRule } from './reminder-rule-records.js';
import { assertValidRule } from './rule-checks.js';

/**
 * rm.rules › create : nouvelle règle de relance (fonctionnalité `auto_reminders` du plan, sinon 403
 * `feature_disabled`). Message gardé comme modèle de l'association (message_templates, canal `manual`), cité par la
 * règle. Audité (`reminder_rule.create`).
 */
@Injectable()
export class CreateReminderRuleUseCase {
  @Audited('reminder_rule.create')
  async execute(aid: string, input: RuleInput): Promise<z.infer<typeof ReminderRule>> {
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'auto_reminders');
    await assertValidRule(associationId, input);
    const templateId = await saveRuleTemplate({ associationId, key: RULE_TEMPLATE_KEY, body: input.message });
    const [row] = await currentTx()
      .insert(reminderRules)
      .values({
        associationId,
        projectId: input.projectId,
        trigger: input.trigger,
        offsetDays: input.offsetDays,
        channels: [...input.channels],
        templateId,
        isActive: input.isActive,
      })
      .returning();
    if (!row) throw new Error('règle de relance non créée');
    const rule = toReminderRule(row, input.message);
    recordAudit({ entityType: 'reminder_rule', entityId: row.id, after: { ...rule } });
    return rule;
  }
}
