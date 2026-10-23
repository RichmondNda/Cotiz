import { auditLogs } from '@cotiz/db';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
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

export interface PlatformActivityEntry {
  action: string;
  occurredAt: Date;
  associationId: string;
}

/**
 * Dernières entrées du journal portant sur une association, toutes associations confondues, limitées aux actions
 * données, la plus récente en premier (activité du tableau de bord plateforme ; index partiel
 * `audit_platform_activity`, dont la liste d'actions doit couvrir celle-ci). Plateforme seulement.
 */
export async function platformRecentActivityOf(
  actions: readonly string[],
  limit: number,
): Promise<PlatformActivityEntry[]> {
  if (currentContext()?.space !== 'platform') throw new Error('platformRecentActivityOf : espace plateforme seulement');
  if (actions.length === 0) return [];
  const rows = await currentTx()
    .select({ action: auditLogs.action, occurredAt: auditLogs.occurredAt, associationId: auditLogs.associationId })
    .from(auditLogs)
    .where(and(isNotNull(auditLogs.associationId), inArray(auditLogs.action, [...actions])))
    .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
    .limit(limit);
  return rows.flatMap((r) => (r.associationId ? [{ ...r, associationId: r.associationId }] : []));
}
