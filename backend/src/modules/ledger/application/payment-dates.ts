import { payments } from '@cotiz/db';
import type { IsoDate } from '@cotiz/domain';
import { and, eq, max } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Date (selon le souscripteur) du dernier paiement validé de chaque inscription d'un projet de l'association du
 * contexte (RLS) : colonne « Dernier paiement » du rapport (rp.report, lot 2.6).
 */
export async function lastValidatedPaymentDates(
  associationId: string,
  projectId: string,
): Promise<Map<string, IsoDate>> {
  const rows = await currentTx()
    .select({ enrollmentId: payments.enrollmentId, paidOn: max(payments.paidOn) })
    .from(payments)
    .where(
      and(
        eq(payments.associationId, associationId),
        eq(payments.projectId, projectId),
        eq(payments.status, 'validated'),
      ),
    )
    .groupBy(payments.enrollmentId);
  return new Map(rows.flatMap((r) => (r.paidOn ? [[r.enrollmentId, r.paidOn] as const] : [])));
}
