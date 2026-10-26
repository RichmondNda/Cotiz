import { auditLogs } from '@cotiz/db';
import { and, count, desc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
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

/** Entités suivies par une frise : un type d'entité, ses identifiants, les actions retenues. */
export interface AuditSubject {
  entityType: string;
  entityIds: readonly string[];
  actions: readonly string[];
}

export interface AssociationAuditEntry {
  /** Identifiant séquentiel de l'entrée, en texte. */
  id: string;
  /** `occurred_at` tel que PostgreSQL le sert (curseur exact à la microseconde). */
  at: string;
  occurredAt: Date;
  action: string;
  entityType: string;
  entityId: string | null;
  after: Record<string, unknown> | null;
}

/**
 * Entrées du journal de l'association du contexte (RLS tenant_read) portant sur ces entités, les plus récentes d'abord,
 * pages par (date, id) ; le total sans la page (frise d'un souscripteur, mb.timeline). Espace association seulement.
 */
export async function associationAuditTrailOf(
  subjects: readonly AuditSubject[],
  page: { after: { at: string; id: string } | null; limit: number },
): Promise<{ entries: AssociationAuditEntry[]; total: number }> {
  const context = currentContext();
  if (context?.space !== 'association' || !context.associationId) {
    throw new Error('associationAuditTrailOf : contexte d’une association attendu');
  }
  const matching = or(
    ...subjects
      .filter((s) => s.entityIds.length > 0 && s.actions.length > 0)
      .map((s) =>
        and(
          eq(auditLogs.entityType, s.entityType),
          inArray(auditLogs.entityId, [...s.entityIds]),
          inArray(auditLogs.action, [...s.actions]),
        ),
      ),
  );
  if (!matching) return { entries: [], total: 0 };
  const filter = and(eq(auditLogs.associationId, context.associationId), matching);
  const after = page.after
    ? sql`(${auditLogs.occurredAt}, ${auditLogs.id}) < (${page.after.at}::timestamptz, ${page.after.id}::bigint)`
    : undefined;
  const tx = currentTx();
  const rows = await tx
    .select({
      id: sql<string>`${auditLogs.id}::text`,
      at: sql<string>`${auditLogs.occurredAt}::text`,
      occurredAt: auditLogs.occurredAt,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      after: auditLogs.after,
    })
    .from(auditLogs)
    .where(and(filter, after))
    .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
    .limit(page.limit);
  const [totals] = await tx.select({ n: count() }).from(auditLogs).where(filter);
  return { entries: rows, total: totals?.n ?? 0 };
}
