import { Injectable } from '@nestjs/common';
import type { AssociationSubscription } from '@cotiz/contracts';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { toPublicPlan } from './plan-records.js';
import { quotaUsageOf } from './quota.service.js';
import { ownSubscriptionOf } from './subscription-views.js';

/**
 * bl.sub : abonnement de l'association pour ses gestionnaires (mg-abonnement) : plan, période, prix, quotas et usage.
 * Abonnement en cours, à défaut le plus récent ; aucun : 404 (choix Q8). Usage compté comme QuotaService (Q7) ;
 * projets à 0 jusqu'au lot 2.2 (Q6, la table `projects` n'existe pas encore).
 */
@Injectable()
export class GetAssociationSubscriptionUseCase {
  async execute(aid: string): Promise<z.infer<typeof AssociationSubscription>> {
    // Forme canonique de l'URL, comme MembershipGuard ; ownSubscriptionOf refuse une autre association que le contexte.
    const associationId = aid.toLowerCase();
    const found = await ownSubscriptionOf(associationId);
    if (!found) throw new DomainProblem('not_found');
    const { subscription: s, plan } = found;
    return {
      plan: toPublicPlan(plan),
      billingPeriod: s.subscription.billingPeriod,
      status: s.subscription.status,
      price: s.subscription.price,
      currentPeriodStart: s.subscription.currentPeriodStart,
      currentPeriodEnd: s.subscription.currentPeriodEnd,
      trialEndsOn: s.subscription.trialEndsOn,
      quotas: {
        projects: { used: 0, limit: s.limits.projects },
        subscribers: { used: await quotaUsageOf(associationId, 'subscribers'), limit: s.limits.subscribers },
        managers: { used: await quotaUsageOf(associationId, 'managers'), limit: s.limits.managers },
      },
    };
  }
}
