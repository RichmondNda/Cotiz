import type { PlanRef, PlatformSubscription } from '@cotiz/contracts';
import { plans, subscriptions } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import type { PlanRow } from './plan-records.js';

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
  return subscriptionOf(associationId, true);
}

/**
 * Abonnement affiché sur la fiche plateforme (pf.asso.get) : celui en cours, à défaut le plus récent (suspendu,
 * résilié) ; `null` si l'association n'en a jamais eu. Limites : celles de son plan, même s'il ne s'applique plus.
 */
export async function latestSubscriptionOf(associationId: string): Promise<CurrentSubscription | null> {
  if (currentContext()?.space !== 'platform') throw new Error('latestSubscriptionOf : espace plateforme seulement');
  return subscriptionOf(associationId, false);
}

/** L'abonnement est en cours (`subscriptions_one_active`) : passe devant les plus récents qui ne le sont plus. */
const isCurrent = sql<boolean>`${subscriptions.status} IN ('trialing', 'active', 'past_due')`;

/**
 * Plan affiché de chaque association (liste plateforme, pf.asso.list) : celui de l'abonnement en cours, à défaut du
 * plus récent ; une association sans abonnement n'y figure pas. Toutes les associations en une lecture : filtre et
 * compteurs par plan de la liste. Plateforme seulement.
 */
export async function displayedPlansOf(): Promise<Map<string, PlanRef>> {
  if (currentContext()?.space !== 'platform') throw new Error('displayedPlansOf : espace plateforme seulement');
  const rows = await currentTx()
    .selectDistinctOn([subscriptions.associationId], {
      associationId: subscriptions.associationId,
      id: plans.id,
      code: plans.code,
      name: plans.name,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .orderBy(subscriptions.associationId, desc(isCurrent), desc(subscriptions.createdAt), desc(subscriptions.id));
  return new Map(rows.map(({ associationId, ...plan }) => [associationId, plan]));
}

/** Abonnement en cours, à défaut (`currentOnly` faux) le plus récent, et son plan ; `undefined` s'il n'y en a pas. */
async function subscriptionRowOf(associationId: string, currentOnly: boolean) {
  const [row] = await currentTx()
    .select({ subscription: subscriptions, plan: plans })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.associationId, associationId),
        currentOnly ? inArray(subscriptions.status, CURRENT) : undefined,
      ),
    )
    .orderBy(desc(isCurrent), desc(subscriptions.createdAt), desc(subscriptions.id))
    .limit(1);
  return row;
}

/**
 * Abonnement de l'association du contexte, vu par ses gestionnaires (bl.sub) : celui en cours, à défaut le plus récent
 * (choix Q8) ; `null` si elle n'en a jamais eu. Plan complet (carte « Plan actuel »), prix au tarif actuel du plan.
 */
export async function ownSubscriptionOf(
  associationId: string,
): Promise<{ subscription: CurrentSubscription; plan: PlanRow } | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('ownSubscriptionOf : contexte de cette association attendu');
  }
  const row = await subscriptionRowOf(associationId, false);
  return row ? { subscription: toCurrentSubscription(row), plan: row.plan } : null;
}

async function subscriptionOf(associationId: string, currentOnly: boolean): Promise<CurrentSubscription | null> {
  const row = await subscriptionRowOf(associationId, currentOnly);
  return row ? toCurrentSubscription(row) : null;
}

function toCurrentSubscription(row: {
  subscription: typeof subscriptions.$inferSelect;
  plan: PlanRow;
}): CurrentSubscription {
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

export interface SubscriptionStanding {
  status: (typeof CURRENT)[number];
  /** Dernier jour inclus de la période en cours. */
  currentPeriodEnd: string | null;
  /** Limites appliquées (surcharge des comptes gestionnaires comprise) ; `null` : illimité. */
  limits: { subscribers: number | null; managers: number | null };
}

/**
 * Abonnement en cours de chaque association qui en a un (tableau de bord plateforme : impayés, quotas). Toutes les
 * associations en une lecture ; au plus un par association (`subscriptions_one_active`). Plateforme seulement.
 */
export async function platformCurrentSubscriptions(): Promise<Map<string, SubscriptionStanding>> {
  if (currentContext()?.space !== 'platform')
    throw new Error('platformCurrentSubscriptions : espace plateforme seulement');
  const rows = await currentTx()
    .select({
      associationId: subscriptions.associationId,
      status: subscriptions.status,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      managerSeatsOverride: subscriptions.managerSeatsOverride,
      maxSubscribers: plans.maxSubscribers,
      maxManagers: plans.maxManagers,
    })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(inArray(subscriptions.status, CURRENT));
  const standings = new Map<string, SubscriptionStanding>();
  for (const r of rows) {
    // Filtré par CURRENT : jamais suspended ni canceled.
    const status = r.status as SubscriptionStanding['status'];
    standings.set(r.associationId, {
      status,
      currentPeriodEnd: r.currentPeriodEnd,
      limits: { subscribers: r.maxSubscribers, managers: r.managerSeatsOverride ?? r.maxManagers },
    });
  }
  return standings;
}
