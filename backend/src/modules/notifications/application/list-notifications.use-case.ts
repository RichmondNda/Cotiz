import { Injectable } from '@nestjs/common';
import { ENDPOINTS, type Notification } from '@cotiz/contracts';
import { notifications as t } from '@cotiz/db';
import { and, count, desc, eq, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { UnreadCounter } from '../infra/unread-counter.js';
import { notificationScopeOf } from './notification-scope.js';

type ListQuery = z.infer<(typeof ENDPOINTS)['nt.list']['operations']['list']['request']['query']>;

/** Vue d'une ligne : `data` sans l'audience (champ interne du filtrage par espace). */
export function notificationView(row: typeof t.$inferSelect): Notification {
  const { audience: _audience, ...data } = row.data;
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    actionUrl: row.actionUrl,
    data,
    associationId: row.associationId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * nt.list : notifications de la personne dans l'espace courant (notificationScopeOf), les plus récentes d'abord,
 * pages par curseur (création, id). Filtres : `unread`, `type`.
 */
@Injectable()
export class ListNotificationsUseCase {
  async execute(query: ListQuery): Promise<{ items: Notification[]; nextCursor: string | null; total: number }> {
    if (query.sort !== undefined && query.sort !== '-createdAt') {
      throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    }
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const scope = await notificationScopeOf(requireActor());
    if (!scope.where) return { items: [], nextCursor: null, total: 0 };
    const filtered = and(
      scope.where,
      query.unread === true ? isNull(t.readAt) : undefined,
      query.unread === false ? sql`${t.readAt} IS NOT NULL` : undefined,
      query.type === undefined ? undefined : eq(t.type, query.type),
    );
    const after = cursor ? sql`(${t.createdAt}, ${t.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined;
    const tx = currentTx();
    const rows = await tx
      .select({ row: t, at: sql<string>`${t.createdAt}::text` })
      .from(t)
      .where(and(filtered, after))
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(query.limit + 1);
    const [total] = await tx.select({ n: count() }).from(t).where(filtered);
    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page.map((r) => notificationView(r.row)),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: total?.n ?? 0,
    };
  }
}

/** nt.list › unreadCount : non lues de l'espace courant, en cache Redis (60 s, invalidé à chaque création ou lecture). */
@Injectable()
export class CountUnreadNotificationsUseCase {
  constructor(private readonly counter: UnreadCounter) {}

  async execute(): Promise<{ count: number }> {
    const actor = requireActor();
    const scope = await notificationScopeOf(actor);
    if (!scope.where) return { count: 0 };
    const cached = await this.counter.get(actor.userId, scope.key);
    if (cached !== null) return { count: cached };
    const [row] = await currentTx()
      .select({ n: count() })
      .from(t)
      .where(and(scope.where, isNull(t.readAt)));
    const n = row?.n ?? 0;
    await this.counter.set(actor.userId, scope.key, n);
    return { count: n };
  }
}
