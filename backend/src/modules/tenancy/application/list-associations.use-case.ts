import { Injectable } from '@nestjs/common';
import {
  AssociationStatus,
  type Facets,
  type PlatformAssociationSummary,
  type PlatformAssociationsQuery,
} from '@cotiz/contracts';
import { associations as t } from '@cotiz/db';
import { and, asc, count, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import { teamsOf } from '../../access/access.public.js';
import { displayedPlansOf } from '../../billing/billing.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { containsPattern, decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { lastActivitiesOf, toSummary } from './association-views.js';

const SORTS: Partial<Record<string, 'asc' | 'desc'>> = { createdAt: 'asc', '-createdAt': 'desc' };

export interface AssociationPage {
  items: PlatformAssociationSummary[];
  nextCursor: string | null;
  total: number;
  facets: Facets;
}

/**
 * pf.asso.list : associations de la plateforme (sa-associations), la plus ancienne en premier par défaut (capture
 * SaAssociations__nominal). Filtres :
 * statut, plan affiché (billing), pays, recherche (nom ou ville). Compteurs par statut (avec les autres filtres) et
 * par plan (avec les autres filtres). Pages par curseur (date d'entrée, id). Connexion plateforme (cotiz_platform).
 */
@Injectable()
export class ListAssociationsUseCase {
  async execute(query: z.infer<typeof PlatformAssociationsQuery>): Promise<AssociationPage> {
    const direction = query.sort === undefined ? 'asc' : SORTS[query.sort];
    if (!direction) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }

    const plans = await displayedPlansOf();
    const filters: SQL[] = [];
    if (query.q) {
      const pattern = containsPattern(query.q);
      const search = or(ilike(t.name, pattern), ilike(t.city, pattern));
      if (search) filters.push(search);
    }
    if (query.country) filters.push(eq(t.country, query.country));
    const byStatus = query.status ? eq(t.status, query.status) : undefined;
    const onPlan = query.planId ? onPlanOf(plans, query.planId) : undefined;
    const filtered = and(...filters, byStatus, onPlan);
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
      .where(and(...filters, onPlan))
      .groupBy(t.status);
    const planScope = await tx
      .select({ id: t.id })
      .from(t)
      .where(and(...filters, byStatus));

    const page = rows.slice(0, query.limit);
    const last = page.at(-1);
    const teams = await teamsOf(page.map((r) => r.row.id));
    const activity = await lastActivitiesOf(teams);
    const status = Object.fromEntries(AssociationStatus.options.map((s) => [s, 0]));
    for (const { status: s, n } of statusCounts) status[s] = n;
    const plan: Record<string, number> = {};
    for (const { id } of planScope) {
      const planId = plans.get(id)?.id;
      if (planId) plan[planId] = (plan[planId] ?? 0) + 1;
    }
    return {
      items: page.map(({ row }) => {
        const displayed = plans.get(row.id);
        if (!displayed) throw new Error(`association ${row.id} sans abonnement`);
        return toSummary(row, displayed, teams.get(row.id), activity.get(row.id));
      }),
      nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
      total: totals?.n ?? 0,
      facets: { status, plan },
    };
  }
}

/** Associations dont le plan affiché est celui demandé (aucune : condition toujours fausse). */
function onPlanOf(plans: ReadonlyMap<string, { id: string }>, planId: string): SQL {
  const ids = [...plans].flatMap(([associationId, plan]) => (plan.id === planId ? [associationId] : []));
  return ids.length === 0 ? sql`false` : inArray(t.id, ids);
}
