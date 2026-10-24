import { Injectable } from '@nestjs/common';
import { ResetRequestStatus, type ResetRequestList, type ResetRequestsQuery } from '@cotiz/contracts';
import { passwordResetRequests as t } from '@cotiz/db';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { platformHandled, toResetRequests } from './platform-reset-requests.js';

/**
 * pf.resets (list) : demandes « mot de passe oublié » des gestionnaires (sa-resets), des plus anciennes aux plus
 * récentes (file à traiter), filtre par statut, compteurs par statut (sans ce filtre), pages par curseur.
 */
@Injectable()
export class ListPlatformResetRequestsUseCase {
  async execute(query: z.infer<typeof ResetRequestsQuery>): Promise<z.infer<typeof ResetRequestList>> {
    if (currentContext()?.space !== 'platform') throw new Error('pf.resets : espace plateforme seulement');
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const filtered = and(platformHandled, query.status ? eq(t.status, query.status) : undefined);
    const after = cursor ? sql`(${t.createdAt}, ${t.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined;

    const tx = currentTx();
    const rows = await tx
      .select({ row: t, at: sql<string>`${t.createdAt}::text` })
      .from(t)
      .where(and(filtered, after))
      .orderBy(asc(t.createdAt), asc(t.id))
      .limit(query.limit + 1);
    const [totals] = await tx.select({ n: count() }).from(t).where(filtered);
    const statusCounts = await tx
      .select({ status: t.status, n: count() })
      .from(t)
      .where(platformHandled)
      .groupBy(t.status);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const status = Object.fromEntries(ResetRequestStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of statusCounts) status[s] = n;
    return {
      items: await toResetRequests(page.map((r) => r.row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status },
    };
  }
}
