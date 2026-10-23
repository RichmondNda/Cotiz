import { plans, subscriptions } from '@cotiz/db';
import { type BillingPeriod, firstSubscriptionPeriod, newId } from '@cotiz/domain';
import { and, eq } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export interface NewSubscription {
  associationId: string;
  planId: string;
  billingPeriod: BillingPeriod;
  /** Date ISO de début. */
  startsOn: string;
  /** Comptes gestionnaires accordés ; `null` ou égal au plan : aucune surcharge (le plan s'applique, illimité compris). */
  managerSeats: number | null;
  /** Jours d'essai (création directe) ; `null` : abonnement actif dès le début. */
  trialDays: number | null;
}

/**
 * Premier abonnement d'une nouvelle association (approbation, création directe), dans la transaction de l'appelant ;
 * période et statut par `firstSubscriptionPeriod` (domain-rules § 10). `null` si le plan n'existe pas ou n'est plus
 * proposé (l'appelant le signale sur son champ). Espace plateforme seulement.
 */
export async function openSubscription(input: NewSubscription): Promise<{ id: string } | null> {
  if (currentContext()?.space !== 'platform') throw new Error('openSubscription : espace plateforme seulement');
  const tx = currentTx();
  // Verrou partagé : le plan ne peut être archivé entre la vérification et l'abonnement.
  const [plan] = await tx
    .select({ maxManagers: plans.maxManagers })
    .from(plans)
    .where(and(eq(plans.id, input.planId), eq(plans.isActive, true)))
    .for('share');
  if (!plan) return null;

  const period = firstSubscriptionPeriod(input);
  const id = newId();
  await tx.insert(subscriptions).values({
    id,
    associationId: input.associationId,
    planId: input.planId,
    billingPeriod: input.billingPeriod,
    status: period.status,
    currentPeriodStart: input.startsOn,
    currentPeriodEnd: period.currentPeriodEnd,
    trialEndsAt: period.trialEndsAt,
    managerSeatsOverride: input.managerSeats === plan.maxManagers ? null : input.managerSeats,
  });
  return { id };
}
