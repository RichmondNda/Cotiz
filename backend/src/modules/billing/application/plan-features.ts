import type { Feature } from '@cotiz/contracts';
import { plans, subscriptions } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/domain-problem.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Abonnement en cours (au plus un, index `subscriptions_one_active`). */
const CURRENT = ['trialing', 'active', 'past_due'] as const;

/**
 * Fonctionnalités `planGated` du plan de l'abonnement en cours de l'association (features.yaml) ; aucune sans
 * abonnement en cours. Lues en base dans le contexte de l'association (RLS de `subscriptions`), jamais en cache : une
 * décision qui protège une limite ne lit pas un cache (lot 1.4).
 */
export async function planFeaturesOf(associationId: string): Promise<readonly Feature[]> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('planFeaturesOf : contexte de cette association attendu');
  }
  const [row] = await currentTx()
    .select({ features: plans.features })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(subscriptions.associationId, associationId), inArray(subscriptions.status, CURRENT)));
  return (row?.features ?? []) as Feature[];
}

/** Fonctionnalité comprise dans le plan de l'association, ou 403 `feature_disabled` (architecture/06). */
export async function assertPlanFeature(associationId: string, feature: Feature): Promise<void> {
  if (!(await planFeaturesOf(associationId)).includes(feature)) throw new DomainProblem('feature_disabled');
}
