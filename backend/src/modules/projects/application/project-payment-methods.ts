import type { ProjectPaymentMethod } from '@cotiz/contracts';
import { projectPaymentMethods } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { lockPaymentMethods, paymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { FieldProblems } from '../domain/project-terms.js';

type Chosen = readonly z.infer<typeof ProjectPaymentMethod>[];

/**
 * Moyens de paiement choisis pour un projet : de l'association et actifs (`not_available`), chacun une fois
 * (`duplicate`). Prend le verrou d'as.pm : un moyen retenu ici n'est pas supprimé en même temps.
 */
export async function paymentMethodProblems(associationId: string, chosen: Chosen): Promise<FieldProblems> {
  await lockPaymentMethods(associationId);
  if (chosen.length === 0) return {};
  const active = new Set((await paymentMethodsOf(associationId)).filter((m) => m.isActive).map((m) => m.id));
  const seen = new Set<string>();
  const problems: FieldProblems = {};
  chosen.forEach((m, i) => {
    const field = `paymentMethods.${String(i)}.paymentMethodId`;
    if (!active.has(m.paymentMethodId)) problems[field] = 'not_available';
    else if (seen.has(m.paymentMethodId)) problems[field] = 'duplicate';
    seen.add(m.paymentMethodId);
  });
  return problems;
}

/** Remplace les moyens retenus par le projet (liste vide : ceux de l'association, choix Q7). */
export async function replaceProjectPaymentMethods(
  associationId: string,
  projectId: string,
  chosen: Chosen,
): Promise<void> {
  const tx = currentTx();
  await tx
    .delete(projectPaymentMethods)
    .where(and(eq(projectPaymentMethods.associationId, associationId), eq(projectPaymentMethods.projectId, projectId)));
  if (chosen.length === 0) return;
  await tx.insert(projectPaymentMethods).values(
    chosen.map((m) => ({
      projectId,
      paymentMethodId: m.paymentMethodId,
      associationId,
      instructionsOverride: m.instructionsOverride,
    })),
  );
}
