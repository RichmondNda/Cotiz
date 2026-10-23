import type { AssociationRequestSummary } from '@cotiz/contracts';
import { associationRequests as t } from '@cotiz/db';
import { asc, count, eq } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { referencesOf, toSummary } from './request-views.js';

export interface PendingRequests {
  count: number;
  /** Les plus anciennes d'abord (ordre de la file « À traiter »). */
  oldest: AssociationRequestSummary[];
}

/**
 * Demandes à traiter, lues en direct (tableau de bord plateforme, pf.dashboard) : une décision s'y voit aussitôt.
 * Index `association_requests_queue`. Plateforme seulement.
 */
export async function platformPendingRequestsOf(limit: number): Promise<PendingRequests> {
  if (currentContext()?.space !== 'platform')
    throw new Error('platformPendingRequestsOf : espace plateforme seulement');
  const tx = currentTx();
  const [total] = await tx.select({ n: count() }).from(t).where(eq(t.status, 'pending'));
  const rows = await tx
    .select()
    .from(t)
    .where(eq(t.status, 'pending'))
    .orderBy(asc(t.createdAt), asc(t.id))
    .limit(limit);
  const { plans } = await referencesOf(rows);
  return { count: total?.n ?? 0, oldest: rows.map((row) => toSummary(row, plans)) };
}
