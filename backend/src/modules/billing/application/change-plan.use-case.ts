import { Injectable } from '@nestjs/common';
import type { ChangePlanInput, PlatformSubscription } from '@cotiz/contracts';
import { plans, subscriptions } from '@cotiz/db';
import { todayIn } from '@cotiz/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { membersOf } from '../../access/access.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { TIMEZONE } from '../../../shared/scheduler/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { lockQuota } from './quota.service.js';
import { currentSubscriptionOf } from './subscription-views.js';

/** Abonnement en cours : au plus un par association (index `subscriptions_one_active`). */
const CURRENT = ['trialing', 'active', 'past_due'] as const;

/**
 * pf.asso.plan : changement de plan de l'abonnement en cours, à effet immédiat (date d'effet = aujourd'hui, fuseau de
 * la plateforme ; sinon 422 `effectiveOn: must_be_today`). Période de facturation changée si demandée ; dates de
 * période inchangées (facturation : lot 4.6). Surcharge des comptes gestionnaires conservée (retirée si égale au
 * nouveau plan). Refus 409 `quota_exceeded` (limit, usage) si les souscripteurs ou gestionnaires dépassent le nouveau
 * plan, comptés comme QuotaService, sous les mêmes verrous ; projets : comptés au lot 2.1. Plan archivé ou inconnu :
 * 422 `planId: unavailable` ; rien ne change ou sans abonnement en cours : 409 `invalid_state` ; association sans
 * abonnement : 404. Les ajouts concurrents (QuotaService.assert) attendent le verrou et voient le nouveau plan.
 */
@Injectable()
export class ChangePlanUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('subscription.change_plan')
  async execute(associationId: string, input: z.infer<typeof ChangePlanInput>): Promise<PlatformSubscription> {
    if (currentContext()?.space !== 'platform') throw new Error('ChangePlanUseCase : espace plateforme seulement');
    const actor = requireActor();
    if (input.effectiveOn !== todayIn(TIMEZONE)) {
      throw new DomainProblem('validation_failed', { fields: { effectiveOn: 'must_be_today' } });
    }
    const tx = currentTx();
    const [current] = await tx
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        billingPeriod: subscriptions.billingPeriod,
        override: subscriptions.managerSeatsOverride,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.associationId, associationId), inArray(subscriptions.status, CURRENT)))
      .for('update');
    if (!current) {
      const [any] = await tx
        .select({ id: subscriptions.id })
        .from(subscriptions)
        .where(eq(subscriptions.associationId, associationId))
        .limit(1);
      throw new DomainProblem(any ? 'invalid_state' : 'not_found');
    }
    // Verrou partagé : le plan ne peut être archivé entre la vérification et le changement.
    const [plan] = await tx
      .select({ maxSubscribers: plans.maxSubscribers, maxManagers: plans.maxManagers })
      .from(plans)
      .where(and(eq(plans.id, input.planId), eq(plans.isActive, true)))
      .for('share');
    if (!plan) throw new DomainProblem('validation_failed', { fields: { planId: 'unavailable' } });
    const billingPeriod = input.billingPeriod ?? current.billingPeriod;
    if (input.planId === current.planId && billingPeriod === current.billingPeriod) {
      throw new DomainProblem('invalid_state');
    }
    const override = current.override === plan.maxManagers ? null : current.override;

    await lockQuota(associationId, 'subscribers');
    await lockQuota(associationId, 'managers');
    const members = await membersOf(associationId);
    const checks = [
      { limit: plan.maxSubscribers, usage: members.subscribers },
      { limit: override ?? plan.maxManagers, usage: members.managers.length },
    ];
    for (const { limit, usage } of checks) {
      if (limit !== null && usage > limit) throw new DomainProblem('quota_exceeded', { limit, usage });
    }

    await tx
      .update(subscriptions)
      .set({ planId: input.planId, billingPeriod, managerSeatsOverride: override })
      .where(eq(subscriptions.id, current.id));
    await this.outbox.publish(tx, {
      type: 'subscription.plan_changed',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'subscription', id: current.id },
      payload: {
        associationId,
        fromPlanId: current.planId,
        toPlanId: input.planId,
        effectiveAt: new Date().toISOString(),
      },
    });
    recordAudit({
      entityType: 'subscription',
      entityId: current.id,
      associationId,
      before: { planId: current.planId, billingPeriod: current.billingPeriod, managerSeatsOverride: current.override },
      after: { planId: input.planId, billingPeriod, managerSeatsOverride: override },
    });
    const updated = await currentSubscriptionOf(associationId);
    if (!updated) throw new Error('ChangePlanUseCase : abonnement en cours introuvable après le changement');
    return updated.subscription;
  }
}
