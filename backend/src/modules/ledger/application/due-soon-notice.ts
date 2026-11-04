import { enrollments, installments } from '@cotiz/db';
import { type Currency, Money, remainingOf } from '@cotiz/domain';
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { projectOf } from '../../projects/projects.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { FINAL_INSTALLMENT_STATUSES, toLedger } from './payment-review.js';

/** Ce que dit le rappel « échéance dans 3 jours » (lot 2.5) : le reste dû, relu au moment de notifier. */
export interface DueSoonNotice {
  projectId: string;
  projectName: string;
  /** Reste dû des échéances visées encore ouvertes, à la lecture (remainingOf). Nul : plus rien à rappeler. */
  remaining: Money;
}

/**
 * Échéances d'un souscripteur visées par un rappel, lues dans le contexte de leur association (RLS) : seules celles de
 * cette personne, de ce projet, d'une inscription active, non soldées, dispensées ni annulées. `null` si le projet n'existe pas (ou plus).
 */
export async function dueSoonNoticeOf(
  associationId: string,
  input: { userId: string; projectId: string; installmentIds: readonly string[] },
): Promise<DueSoonNotice | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('dueSoonNoticeOf : contexte de cette association seulement');
  }
  const project = await projectOf(associationId, input.projectId);
  if (!project) return null;
  const currency = project.currency as Currency;
  let remaining = Money.zero(currency);
  if (input.installmentIds.length > 0) {
    const rows = await currentTx()
      .select({ installment: installments })
      .from(installments)
      .innerJoin(enrollments, eq(enrollments.id, installments.enrollmentId))
      .where(
        and(
          eq(installments.associationId, associationId),
          eq(installments.userId, input.userId),
          eq(installments.projectId, input.projectId),
          inArray(installments.id, [...new Set(input.installmentIds)]),
          notInArray(installments.status, [...FINAL_INSTALLMENT_STATUSES]),
          // Inscription retirée (ou terminée) entre la tâche et la notification : plus de rappel.
          eq(enrollments.status, 'active'),
        ),
      );
    for (const { installment: i } of rows) {
      const left = remainingOf(toLedger(i, currency));
      if (left > 0) remaining = Money.add(remaining, Money.of(left, currency));
    }
  }
  return { projectId: project.id, projectName: project.name, remaining };
}
