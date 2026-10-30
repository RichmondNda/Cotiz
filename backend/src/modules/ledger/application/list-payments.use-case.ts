import { Injectable } from '@nestjs/common';
import { type Facets, PaymentStatus, type PaymentSummary, type PaymentsQuery } from '@cotiz/contracts';
import { payments as t } from '@cotiz/db';
import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { paymentRefsOf, paymentSummary } from './payment-views.js';

const SORTS: Partial<Record<string, 'asc' | 'desc'>> = { declaredAt: 'asc', '-declaredAt': 'desc' };
const DAY_MS = 86_400_000;

/**
 * lg.pay.list : paiements de l'association (RLS), la file de validation par défaut (`pending`). Filtres : statut,
 * projet, personne, ancienneté (déclaré depuis au moins N jours), montant déclaré. Compteurs par statut avec les autres
 * filtres. Les plus récents d'abord (`sort=declaredAt` : les plus anciens) ; pages par curseur (déclaration, id).
 */
@Injectable()
export class ListPaymentsUseCase {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async execute(
    aid: string,
    query: z.infer<typeof PaymentsQuery>,
  ): Promise<{ items: PaymentSummary[]; nextCursor: string | null; total: number; facets: Facets }> {
    const associationId = contextAssociationId(aid);
    // Clé propre seulement : `sort=constructor` ne doit pas trouver une valeur du prototype.
    const direction =
      query.sort === undefined ? 'desc' : Object.hasOwn(SORTS, query.sort) ? SORTS[query.sort] : undefined;
    if (!direction) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }

    const filters: SQL[] = [eq(t.associationId, associationId)];
    if (query.projectId) filters.push(eq(t.projectId, query.projectId));
    if (query.userId) filters.push(eq(t.userId, query.userId));
    if (query.olderThanDays !== undefined) {
      filters.push(lte(t.declaredAt, new Date(Date.now() - query.olderThanDays * DAY_MS)));
    }
    if (query.minAmount !== undefined) filters.push(gte(t.amountDeclared, BigInt(query.minAmount)));
    if (query.maxAmount !== undefined) filters.push(lte(t.amountDeclared, BigInt(query.maxAmount)));
    const filtered = and(...filters, query.status === 'all' ? undefined : eq(t.status, query.status));
    const after = cursor
      ? direction === 'asc'
        ? sql`(${t.declaredAt}, ${t.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
        : sql`(${t.declaredAt}, ${t.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)`
      : undefined;
    const order = direction === 'asc' ? [asc(t.declaredAt), asc(t.id)] : [desc(t.declaredAt), desc(t.id)];

    const tx = currentTx();
    const rows = await tx
      .select({ row: t, at: sql<string>`${t.declaredAt}::text` })
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
    const refs = await paymentRefsOf(
      associationId,
      page.map((r) => r.row),
      this.accounts,
    );
    const status = Object.fromEntries(PaymentStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of byStatus) status[s] = n;
    return {
      items: page.map((r) => paymentSummary(r.row, refs)),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status },
    };
  }
}
