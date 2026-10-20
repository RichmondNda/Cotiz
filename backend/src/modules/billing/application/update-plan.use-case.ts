import { Injectable } from '@nestjs/common';
import type { Plan, PlanInput } from '@cotiz/contracts';
import { isUniqueViolation, plans, updateWithVersion } from '@cotiz/db';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { planProblems } from '../domain/plan-rules.js';
import { auditView, codeTaken, findPlan, subscribersOf, toPublicPlan, toPlan } from './plan-records.js';
import { publishPlanUpdated } from './plan-events.js';

/**
 * pf.plan.write › patch : seuls les champs envoyés changent, sous verrou optimiste (`If-Match`, 412). Les règles
 * portent sur le plan qui en résulte. Devise figée à la création (lot 1.2) : un prix dans une autre devise est
 * refusé. Désactivé (`isActive: false`), il est archivé comme par pf.plan.archive (mise en avant retirée) ; réactivé,
 * il ne l'est plus ; un plan inactif n'est jamais mis en avant. Les associations abonnées gardent leur plan : ses
 * nouvelles limites s'appliquent (étape 5). Corps vide : 422.
 */
@Injectable()
export class UpdatePlanUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('plan.update')
  async execute(id: string, input: Partial<z.infer<typeof PlanInput>>): Promise<Plan> {
    const actor = requireActor();
    const version = expectedVersion();
    if (Object.keys(input).length === 0) throw new DomainProblem('validation_failed', { fields: { _: 'empty' } });
    const current = await findPlan(id);
    if (!current) throw new DomainProblem('not_found');

    const frozen: Record<string, string> = {};
    for (const field of ['priceMonthly', 'priceYearly'] as const) {
      const price = input[field];
      if (price && price.currency !== current.currency) frozen[field] = 'currency_mismatch';
    }
    if (Object.keys(frozen).length > 0) throw new DomainProblem('validation_failed', { fields: frozen });

    const before = toPublicPlan(current);
    const isActive = input.isActive ?? current.isActive;
    const problems = planProblems({
      priceMonthly: input.priceMonthly ?? before.priceMonthly,
      priceYearly: input.priceYearly ?? before.priceYearly,
      limits: input.limits ?? before.limits,
      features: input.features ?? before.features,
    });
    if (!isActive && input.isFeatured === true) problems.isFeatured = 'inactive_plan';
    if (Object.keys(problems).length > 0) throw new DomainProblem('validation_failed', { fields: problems });
    if (input.code !== undefined && input.code !== current.code && (await codeTaken(input.code, id))) {
      throw new DomainProblem('code_taken');
    }

    const archiving = current.isActive && input.isActive === false;
    let updated;
    try {
      updated = await updateWithVersion(
        currentTx(),
        plans,
        { id, version },
        {
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.priceMonthly ? { priceMonthly: BigInt(input.priceMonthly.amount) } : {}),
          ...(input.priceYearly ? { priceYearly: BigInt(input.priceYearly.amount) } : {}),
          ...(input.limits
            ? {
                maxProjects: input.limits.projects,
                maxSubscribers: input.limits.subscribers,
                maxManagers: input.limits.managers,
              }
            : {}),
          ...(input.features === undefined ? {} : { features: input.features }),
          ...(input.isFeatured === undefined ? {} : { isFeatured: input.isFeatured }),
          ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
          ...(input.isActive === true ? { archivedAt: null } : {}),
          ...(archiving ? { archivedAt: new Date(), isFeatured: false } : {}),
        },
      );
    } catch (error) {
      if (isUniqueViolation(error, 'plans_code_key')) throw new DomainProblem('code_taken');
      throw error;
    }
    if (!updated) throw new DomainProblem('not_found');
    await publishPlanUpdated(this.outbox, id, actor.userId);
    recordAudit({
      entityType: 'plan',
      entityId: id,
      associationId: null,
      before: auditView(current),
      after: auditView(updated),
    });
    return toPlan(updated, await subscribersOf(id));
  }
}
