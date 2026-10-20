import { Injectable } from '@nestjs/common';
import type { Plan } from '@cotiz/contracts';
import { plans, updateWithVersion } from '@cotiz/db';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { auditView, findPlan, subscribersOf, toPlan } from './plan-records.js';
import { publishPlanUpdated } from './plan-events.js';

/**
 * pf.plan.archive › archive : le plan quitte l'offre (pub.plans, mise en avant retirée) mais reste appliqué aux
 * associations abonnées : leurs abonnements ne changent pas. Déjà archivé ou désactivé : `invalid_state`.
 */
@Injectable()
export class ArchivePlanUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('plan.archive')
  async execute(id: string): Promise<Plan> {
    const actor = requireActor();
    const current = await findPlan(id, { lock: true });
    if (!current) throw new DomainProblem('not_found');
    if (!current.isActive) throw new DomainProblem('invalid_state');
    const archived = await updateWithVersion(
      currentTx(),
      plans,
      { id, version: current.version },
      { isActive: false, isFeatured: false, archivedAt: new Date() },
    );
    if (!archived) throw new DomainProblem('not_found');
    await publishPlanUpdated(this.outbox, id, actor.userId);
    recordAudit({
      entityType: 'plan',
      entityId: id,
      associationId: null,
      before: auditView(current),
      after: auditView(archived),
    });
    return toPlan(archived, await subscribersOf(id));
  }
}
