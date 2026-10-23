import { auditLogs } from '@cotiz/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../tenant-context/index.js';

export interface AuditTrailEntry {
  action: string;
  occurredAt: Date;
  actorUserId: string | null;
}

/**
 * Entrées du journal portant sur une association, limitées aux actions données, la plus récente en premier (frise de
 * la fiche plateforme). Plateforme seulement : la connexion plateforme lit le journal de toutes les associations.
 */
export async function platformAuditTrailOf(
  associationId: string,
  actions: readonly string[],
  limit: number,
): Promise<AuditTrailEntry[]> {
  if (currentContext()?.space !== 'platform') throw new Error('platformAuditTrailOf : espace plateforme seulement');
  if (actions.length === 0) return [];
  return currentTx()
    .select({ action: auditLogs.action, occurredAt: auditLogs.occurredAt, actorUserId: auditLogs.actorUserId })
    .from(auditLogs)
    .where(and(eq(auditLogs.associationId, associationId), inArray(auditLogs.action, [...actions])))
    .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
    .limit(limit);
}
