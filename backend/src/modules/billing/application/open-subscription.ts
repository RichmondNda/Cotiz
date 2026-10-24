import { plans, subscriptions } from '@cotiz/db';
import { type BillingPeriod, firstSubscriptionPeriod, newId } from '@cotiz/domain';
import { and, eq, inArray } from 'drizzle-orm';
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

/**
 * Comptes gestionnaires autorisés de l'abonnement en cours (pf.asso.patch), dans la transaction de l'appelant : la
 * surcharge n'est posée que si elle diffère du plan (domain-rules § 10). Renvoie la surcharge avant et après, ou
 * `null` sans abonnement en cours. Espace plateforme seulement.
 */
export async function setManagerSeats(
  associationId: string,
  seats: number | null,
): Promise<{ before: number | null; after: number | null } | null> {
  if (currentContext()?.space !== 'platform') throw new Error('setManagerSeats : espace plateforme seulement');
  const tx = currentTx();
  // Au plus un abonnement en cours par association (index unique partiel `subscriptions_one_active`).
  const [current] = await tx
    .select({ id: subscriptions.id, override: subscriptions.managerSeatsOverride, planMax: plans.maxManagers })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(
      and(
        eq(subscriptions.associationId, associationId),
        inArray(subscriptions.status, ['trialing', 'active', 'past_due']),
      ),
    )
    .for('update', { of: subscriptions });
  if (!current) return null;
  const after = seats === current.planMax ? null : seats;
  if (after !== current.override) {
    await tx.update(subscriptions).set({ managerSeatsOverride: after }).where(eq(subscriptions.id, current.id));
  }
  return { before: current.override, after };
}
