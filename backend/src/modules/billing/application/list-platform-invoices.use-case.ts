import { Injectable } from '@nestjs/common';
import type { PlatformInvoiceList, pfInvoices } from '@cotiz/contracts';
import { invoices } from '@cotiz/db';
import { Money } from '@cotiz/domain';
import { and, eq, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { platformAssociationsOverview } from '../../tenancy/tenancy.public.js';
import { TIMEZONE } from '../../../shared/scheduler/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { invoicePage, platformInvoiceOf } from './invoice-views.js';

type Query = z.infer<(typeof pfInvoices)['operations']['list']['request']['query']>;

/**
 * pf.invoices : factures de toutes les associations (connexion cotiz_platform), les plus récentes d'abord, filtrées
 * par statut et association ; comptes par statut (onglets) et KPI de la facturation globale, mois du fuseau de la
 * plateforme (décision du lot 4.6) : revenu du mois = factures émises ce mois-ci (annulées exclues), encaissé =
 * factures payées ce mois-ci, en attente = factures ouvertes, impayé = factures en retard.
 */
@Injectable()
export class ListPlatformInvoicesUseCase {
  async execute(query: Query): Promise<z.infer<typeof PlatformInvoiceList>> {
    if (currentContext()?.space !== 'platform') throw new Error('pf.invoices : espace plateforme seulement');
    const ofAssociation = query.associationId ? eq(invoices.associationId, query.associationId) : undefined;
    const page = await invoicePage(
      and(query.status ? eq(invoices.status, query.status) : undefined, ofAssociation),
      query,
    );
    const names = new Map((await platformAssociationsOverview()).map((a) => [a.id, a.name]));
    const tx = currentTx();
    const month = sql`date_trunc('month', now() AT TIME ZONE ${TIMEZONE})`;
    const [kpi] = await tx
      .select({
        revenue: sql<string>`coalesce(sum(${invoices.amount}) FILTER (WHERE ${ne(invoices.status, 'void')}
                 AND date_trunc('month', ${invoices.issuedAt} AT TIME ZONE ${TIMEZONE}) = ${month}), 0)::text`,
        collected: sql<string>`coalesce(sum(${invoices.amount}) FILTER (WHERE ${eq(invoices.status, 'paid')}
                   AND date_trunc('month', ${invoices.paidAt} AT TIME ZONE ${TIMEZONE}) = ${month}), 0)::text`,
        pending: sql<string>`coalesce(sum(${invoices.amount}) FILTER (WHERE ${eq(invoices.status, 'open')}), 0)::text`,
        overdue: sql<string>`coalesce(sum(${invoices.amount}) FILTER (WHERE ${eq(invoices.status, 'overdue')}), 0)::text`,
      })
      .from(invoices)
      .where(ofAssociation);
    const byStatus = await tx
      .select({ status: invoices.status, n: sql<number>`count(*)`.mapWith(Number) })
      .from(invoices)
      .where(ofAssociation)
      .groupBy(invoices.status);
    return {
      items: page.rows.map((row) =>
        platformInvoiceOf(row, { id: row.associationId, name: names.get(row.associationId) ?? '' }),
      ),
      nextCursor: page.nextCursor,
      total: page.total,
      summary: {
        revenueThisMonth: Money.fromDb(kpi?.revenue ?? '0', 'XOF'),
        collected: Money.fromDb(kpi?.collected ?? '0', 'XOF'),
        pending: Money.fromDb(kpi?.pending ?? '0', 'XOF'),
        overdue: Money.fromDb(kpi?.overdue ?? '0', 'XOF'),
      },
      facets: { status: Object.fromEntries(byStatus.map((s) => [s.status, s.n])) },
    };
  }
}
