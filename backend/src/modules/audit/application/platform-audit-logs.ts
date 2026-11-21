import type { AuditEntry, AuditFilters } from '@cotiz/contracts';
import { auditLogs } from '@cotiz/db';
import { and, count, desc, eq, gte, lt, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { platformPersonRefsOf } from '../../identity/identity.public.js';
import { type Cursor } from '../../../shared/pagination/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export type AuditFilterInput = z.infer<typeof AuditFilters>;
export type AuditEntryView = z.infer<typeof AuditEntry>;

/** Motif LIKE « commence par » : `%`, `_` et `\` sont des caractères, pas des jokers. */
const startsWith = (text: string) => `${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

/** Conditions SQL des filtres de pf.audit (acteur, préfixe d'action, association, période `[from, to[`). */
function conditions(filters: AuditFilterInput): SQL[] {
  const where: SQL[] = [];
  if (filters.actorUserId) where.push(eq(auditLogs.actorUserId, filters.actorUserId));
  if (filters.action) where.push(sql`${auditLogs.action} LIKE ${startsWith(filters.action)}`);
  if (filters.associationId) where.push(eq(auditLogs.associationId, filters.associationId));
  if (filters.from) where.push(gte(auditLogs.occurredAt, new Date(filters.from)));
  if (filters.to) where.push(lt(auditLogs.occurredAt, new Date(filters.to)));
  return where;
}

/**
 * Journal d'audit de toute la plateforme (pf.audit, lot 4.7), le plus récent d'abord, pages par (date, id). Espace
 * plateforme seulement : la route lit par la connexion `cotiz_platform` (BYPASSRLS, architecture/02) ; ailleurs, la RLS
 * de `audit_logs` ne laisserait voir que l'association du contexte. `limit` lignes au plus, `total` selon les filtres.
 */
export async function platformAuditLogs(
  filters: AuditFilterInput,
  page: { after: Cursor | null; limit: number },
): Promise<{ entries: (AuditEntryView & { at: string })[]; total: number }> {
  if (currentContext()?.space !== 'platform') throw new Error('platformAuditLogs : espace plateforme seulement');
  const tx = currentTx();
  const where = conditions(filters);
  const after = page.after
    ? sql`(${auditLogs.occurredAt}, ${auditLogs.id}) < (${page.after.at}::timestamptz, ${page.after.id}::bigint)`
    : undefined;
  const rows = await tx
    .select({
      id: sql<string>`${auditLogs.id}::text`,
      at: sql<string>`${auditLogs.occurredAt}::text`,
      occurredAt: auditLogs.occurredAt,
      actorUserId: auditLogs.actorUserId,
      actorRole: auditLogs.actorRole,
      associationId: auditLogs.associationId,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      ip: auditLogs.ip,
    })
    .from(auditLogs)
    .where(and(...where, after))
    .orderBy(desc(auditLogs.occurredAt), desc(auditLogs.id))
    .limit(page.limit);
  const [counted] = await tx
    .select({ n: count() })
    .from(auditLogs)
    .where(and(...where));
  const people = await platformPersonRefsOf(rows.flatMap((r) => (r.actorUserId ? [r.actorUserId] : [])));
  return {
    entries: rows.map((r) => ({
      id: r.id,
      at: r.at,
      occurredAt: r.occurredAt.toISOString(),
      actor: r.actorUserId ? (people.get(r.actorUserId) ?? null) : null,
      actorRole: r.actorRole,
      associationId: r.associationId,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      ip: r.ip,
    })),
    total: counted?.n ?? 0,
  };
}
