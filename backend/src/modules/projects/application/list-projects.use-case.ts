import { Injectable } from '@nestjs/common';
import { type Facets, type ProjectsQuery, ProjectStatus, type ProjectSummary } from '@cotiz/contracts';
import { projects as t } from '@cotiz/db';
import { and, asc, count, desc, eq, ilike, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { containsPattern, decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { contextAssociationId, toSummaries } from './project-records.js';

const SORTS: Partial<Record<string, 'asc' | 'desc'>> = { createdAt: 'asc', '-createdAt': 'desc' };

export interface ProjectPage {
  items: z.infer<typeof ProjectSummary>[];
  nextCursor: string | null;
  total: number;
  facets: Facets;
}

/**
 * pr.list : projets de l'association (mg-projets), le plus récent d'abord par défaut. Filtres : statut, recherche par
 * nom. Compteurs par statut (avec les autres filtres). Pages par curseur (date de création, id).
 */
@Injectable()
export class ListProjectsUseCase {
  async execute(aid: string, query: z.infer<typeof ProjectsQuery>): Promise<ProjectPage> {
    const associationId = contextAssociationId(aid);
    const direction = query.sort === undefined ? 'desc' : SORTS[query.sort];
    if (!direction) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }

    const filters: SQL[] = [eq(t.associationId, associationId)];
    if (query.q) filters.push(ilike(t.name, containsPattern(query.q)));
    const byStatus = query.status ? eq(t.status, query.status) : undefined;
    const filtered = and(...filters, byStatus);
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
    const statusCounts = await tx
      .select({ status: t.status, n: count() })
      .from(t)
      .where(and(...filters))
      .groupBy(t.status);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const status = Object.fromEntries(ProjectStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of statusCounts) status[s] = n;
    return {
      items: await toSummaries(page.map((r) => r.row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status },
    };
  }
}
