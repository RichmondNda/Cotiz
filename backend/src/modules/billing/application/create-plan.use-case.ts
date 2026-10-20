import { Injectable } from '@nestjs/common';
import type { Plan, PlanInput } from '@cotiz/contracts';
import { isUniqueViolation, plans } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { planProblems } from '../domain/plan-rules.js';
import { auditView, codeTaken, toPlan } from './plan-records.js';
import { publishPlanUpdated } from './plan-events.js';

/** pf.plan.write › create : nouveau plan (version 1), sans abonné. Code unique (`code_taken`). */
@Injectable()
export class CreatePlanUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('plan.create')
  async execute(input: z.infer<typeof PlanInput>): Promise<Plan> {
    const actor = requireActor();
    const problems = planProblems(input);
    // Un plan inactif n'est jamais mis en avant (landing).
    if (!input.isActive && input.isFeatured) problems.isFeatured = 'inactive_plan';
    if (Object.keys(problems).length > 0) throw new DomainProblem('validation_failed', { fields: problems });
    if (await codeTaken(input.code)) throw new DomainProblem('code_taken');

    let row;
    try {
      [row] = await currentTx()
        .insert(plans)
        .values({
          id: newId(),
          code: input.code,
          name: input.name,
          description: input.description,
          priceMonthly: BigInt(input.priceMonthly.amount),
          priceYearly: BigInt(input.priceYearly.amount),
          currency: input.priceMonthly.currency,
          maxProjects: input.limits.projects,
          maxSubscribers: input.limits.subscribers,
          maxManagers: input.limits.managers,
          features: input.features,
          isFeatured: input.isFeatured,
          isActive: input.isActive,
          archivedAt: input.isActive ? null : new Date(),
        })
        .returning();
    } catch (error) {
      // Création simultanée du même code.
      if (isUniqueViolation(error, 'plans_code_key')) throw new DomainProblem('code_taken');
      throw error;
    }
    if (!row) throw new Error('plan.create : aucune ligne insérée');
    await publishPlanUpdated(this.outbox, row.id, actor.userId);
    recordAudit({ entityType: 'plan', entityId: row.id, associationId: null, after: auditView(row) });
    return toPlan(row, 0);
  }
}
