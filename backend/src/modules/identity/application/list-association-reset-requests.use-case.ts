import { Injectable } from '@nestjs/common';
import { ResetRequestStatus, type ResetRequestList, type ResetRequestsQuery } from '@cotiz/contracts';
import { passwordResetRequests as t } from '@cotiz/db';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { associationHandled, resetsAssociationId, toAssociationResetRequests } from './association-reset-requests.js';

/**
 * as.resets (list) : demandes « mot de passe oublié » des souscripteurs de l'association (mg-resets), des plus anciennes
 * aux plus récentes (file à traiter), filtre par statut, compteurs par statut (sans ce filtre), pages par curseur. Même
 * forme que pf.resets.
 */
@Injectable()
export class ListAssociationResetRequestsUseCase {
  async execute(aid: string, query: z.infer<typeof ResetRequestsQuery>): Promise<z.infer<typeof ResetRequestList>> {
    const associationId = resetsAssociationId(aid);
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const handled = associationHandled(associationId);
    const filtered = and(handled, query.status ? eq(t.status, query.status) : undefined);
    const after = cursor ? sql`(${t.createdAt}, ${t.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined;

    const tx = currentTx();
    const rows = await tx
      .select({ row: t, at: sql<string>`${t.createdAt}::text` })
      .from(t)
      .where(and(filtered, after))
      .orderBy(asc(t.createdAt), asc(t.id))
      .limit(query.limit + 1);
    const [totals] = await tx.select({ n: count() }).from(t).where(filtered);
    const statusCounts = await tx.select({ status: t.status, n: count() }).from(t).where(handled).groupBy(t.status);

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const status = Object.fromEntries(ResetRequestStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of statusCounts) status[s] = n;
    return {
      items: await toAssociationResetRequests(
        associationId,
        page.map((r) => r.row),
      ),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status },
    };
  }
}
