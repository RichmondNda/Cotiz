import { enrollments, installments } from '@cotiz/db';
import { type Currency, dueDateTurningLateOn, type IsoDate, installmentStatus } from '@cotiz/domain';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import { associationProjectsOf } from '../../projects/projects.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { FINAL_INSTALLMENT_STATUSES, toLedger } from './payment-review.js';

/**
 * Souscripteurs passés en retard le jour `today` de l'association (récapitulatif gestionnaire, lot 2.6) : personnes
 * d'une inscription active dont une échéance a `today` pour premier jour de retard (dueDateTurningLateOn, délai de
 * grâce du projet) et reste en retard (installmentStatus : ni soldée, ni déclarée ; partiellement payée, elle compte).
 * Contexte de l'association (RLS).
 *
 * « Nouveau » = le jour où la grâce expire, d'après le départ du retard (late_from, sinon l'échéance) et le délai
 * de grâce actuel : une échéance
 * déclarée ce jour-là puis rejetée plus tard, ou décalée par un changement du délai de grâce, n'est pas signalée comme
 * nouveau retard (elle reste comptée dans les retards du tableau de bord). Voulu pour un récapitulatif quotidien.
 */
export async function newLateSubscribersOf(associationId: string, today: IsoDate): Promise<Set<string>> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('newLateSubscribersOf : contexte de cette association seulement');
  }
  const late = new Set<string>();
  for (const project of await associationProjectsOf(associationId)) {
    // Départ du retard (lateStart) : late_from s'il est posé (toujours postérieur à l'échéance, contrainte
    // installments_late_from_after_due), sinon l'échéance.
    const start = dueDateTurningLateOn(today, project.graceDays);
    const rows = await currentTx()
      .select({ installment: installments })
      .from(installments)
      .innerJoin(enrollments, eq(enrollments.id, installments.enrollmentId))
      .where(
        and(
          eq(installments.associationId, associationId),
          eq(installments.projectId, project.id),
          sql`COALESCE(${installments.lateFrom}, ${installments.dueDate}) = ${start}`,
          notInArray(installments.status, [...FINAL_INSTALLMENT_STATUSES]),
          eq(enrollments.status, 'active'),
        ),
      );
    for (const { installment } of rows) {
      const state = toLedger(installment, project.currency as Currency);
      if (installmentStatus(state, today, project.graceDays) === 'late') late.add(installment.userId);
    }
  }
  return late;
}
