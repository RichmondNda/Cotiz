import { Injectable } from '@nestjs/common';
import type { Plan } from '@cotiz/contracts';
import { plans } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { duplicateCode } from '../domain/plan-rules.js';
import { auditView, codesStartingWith, findPlan, toPlan } from './plan-records.js';
import { publishPlanUpdated } from './plan-events.js';

/**
 * pf.plan.archive › duplicate : copie active d'un plan (archivé compris), sans abonné ni mise en avant, code
 * `<code>-copie` (puis `-copie-2`…), nom « <nom> (copie) ».
 */
@Injectable()
export class DuplicatePlanUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('plan.duplicate')
  async execute(id: string): Promise<Plan> {
    const actor = requireActor();
    // Verrou du plan source : deux duplications simultanées s'enchaînent, la seconde voit le code de la première.
    const source = await findPlan(id, { lock: true });
    if (!source) throw new DomainProblem('not_found');
    const code = duplicateCode(source.code, await codesStartingWith(`${source.code}-copie`));
    const [row] = await currentTx()
      .insert(plans)
      .values({
        id: newId(),
        code,
        name: `${source.name} (copie)`,
        description: source.description,
        priceMonthly: source.priceMonthly,
        priceYearly: source.priceYearly,
        currency: source.currency,
        maxProjects: source.maxProjects,
        maxSubscribers: source.maxSubscribers,
        maxManagers: source.maxManagers,
        features: source.features,
        isFeatured: false,
        isActive: true,
      })
      .returning();
    if (!row) throw new Error('plan.duplicate : aucune ligne insérée');
    await publishPlanUpdated(this.outbox, row.id, actor.userId);
    recordAudit({
      entityType: 'plan',
      entityId: row.id,
      associationId: null,
      after: { ...auditView(row), duplicatedFrom: id },
    });
    return toPlan(row, 0);
  }
}
