import type { PlatformSubscription } from '@cotiz/contracts';
import { plans, subscriptions } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Abonnement en cours (au plus un, index `subscriptions_one_active`). */
const CURRENT = ['trialing', 'active', 'past_due'] as const;

export interface CurrentSubscription {
  subscription: PlatformSubscription;
  /** Limites appliquées (surcharge des comptes gestionnaires comprise) ; `null` : illimité. */
  limits: { projects: number | null; subscribers: number | null; managers: number | null };
}

/**
 * Abonnement en cours d'une association et limites du plan, lus par la plateforme (fiche d'une association) ; `null`
 * sans abonnement en cours. Prix : tarif **actuel** du plan pour la période de facturation (`subscriptions` n'a pas de
 * prix figé ; à trancher avant la facturation, lot 4.6), affiché aussi pendant l'essai ; dans la devise du plan (ce que
 * l'association paie à la plateforme), pas celle de ses encaissements. Lu par `Money.fromDb`.
 */
export async function currentSubscriptionOf(associationId: string): Promise<CurrentSubscription | null> {
  if (currentContext()?.space !== 'platform') throw new Error('currentSubscriptionOf : espace plateforme seulement');
  const [row] = await currentTx()
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.associationId, associationId), inArray(subscriptions.status, CURRENT)))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  if (!row) return null;
  const { subscription: s, plan } = row;
  const currency = plan.currency as Currency;
  return {
    subscription: {
      id: s.id,
      plan: { id: plan.id, code: plan.code, name: plan.name },
      billingPeriod: s.billingPeriod,
      status: s.status,
      price: Money.fromDb(s.billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceYearly, currency),
      currentPeriodStart: s.currentPeriodStart,
      currentPeriodEnd: s.currentPeriodEnd,
      trialEndsOn: s.trialEndsAt,
      managerSeatsOverride: s.managerSeatsOverride,
    },
    limits: {
      projects: plan.maxProjects,
      subscribers: plan.maxSubscribers,
      managers: s.managerSeatsOverride ?? plan.maxManagers,
    },
  };
}
