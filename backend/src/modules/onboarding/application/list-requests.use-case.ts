import { Injectable } from '@nestjs/common';
import {
  AssociationRequestStatus,
  type AssociationRequestSummary,
  type AssociationRequestsQuery,
  type Facets,
} from '@cotiz/contracts';
import { associationRequests as t } from '@cotiz/db';
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { containsPattern, decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { referencesOf, toSummary } from './request-views.js';

const SORTS: Partial<Record<string, 'asc' | 'desc'>> = { createdAt: 'asc', '-createdAt': 'desc' };

export interface RequestPage {
  items: AssociationRequestSummary[];
  nextCursor: string | null;
  total: number;
  facets: Facets;
}

/**
 * pf.req.list : file des demandes (sa-demandes), la plus ancienne en premier par défaut (« À traiter »). Filtres :
 * statut, recherche (nom de l'association ou email du responsable), pays, plan souhaité. Compteurs par statut pour les
 * onglets, avec les autres filtres. Pages par curseur (date de réception, id). Connexion plateforme (cotiz_platform).
 */
@Injectable()
export class ListRequestsUseCase {
  async execute(query: AssociationRequestsQuery): Promise<RequestPage> {
    const direction = query.sort === undefined ? 'asc' : SORTS[query.sort];
    if (!direction) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }

    const filters: SQL[] = [];
    if (query.q) {
      const pattern = containsPattern(query.q);
      const search = or(ilike(t.associationName, pattern), ilike(t.contactEmail, pattern));
      if (search) filters.push(search);
    }
    if (query.country) filters.push(eq(t.country, query.country));
    if (query.desiredPlanId) filters.push(eq(t.desiredPlanId, query.desiredPlanId));
    const filtered = and(...filters, query.status ? eq(t.status, query.status) : undefined);
    const after = cursor
      ? direction === 'asc'
        ? sql`(${t.createdAt}, ${t.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
        : sql`(${t.createdAt}, ${t.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const order = direction === 'asc' ? [asc(t.createdAt), asc(t.id)] : [desc(t.createdAt), desc(t.id)];

    const tx = currentTx();
    const rows = await tx
      .select({ row: t, at: sql<string>`${t.createdAt}::text` })
      .from(t)
      .where(and(filtered, after))
      .orderBy(...order)
      .limit(query.limit + 1);
    const [totals] = await tx.select({ n: count() }).from(t).where(filtered);
    const byStatus = await tx
      .select({ status: t.status, n: count() })
      .from(t)
      .where(and(...filters))
      .groupBy(t.status);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const { plans } = await referencesOf(page.map((r) => r.row));
    const status = Object.fromEntries(AssociationRequestStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of byStatus) status[s] = n;
    return {
      items: page.map((r) => toSummary(r.row, plans)),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status },
    };
  }
}
