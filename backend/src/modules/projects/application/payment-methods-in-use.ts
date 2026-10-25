import { projectPaymentMethods } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Parmi `paymentMethodIds`, les moyens de paiement de l'association retenus par au moins un de ses projets : ils ne
 * se suppriment pas (clé étrangère), as.pm les désactive. Contexte de l'association (RLS).
 */
export async function paymentMethodsInUse(
  associationId: string,
  paymentMethodIds: readonly string[],
): Promise<Set<string>> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('paymentMethodsInUse : contexte de l’association attendu');
  }
  if (paymentMethodIds.length === 0) return new Set();
  const rows = await currentTx()
    .selectDistinct({ id: projectPaymentMethods.paymentMethodId })
    .from(projectPaymentMethods)
    .where(
      and(
        eq(projectPaymentMethods.associationId, associationId),
        inArray(projectPaymentMethods.paymentMethodId, [...paymentMethodIds]),
      ),
    );
  return new Set(rows.map((r) => r.id));
}
