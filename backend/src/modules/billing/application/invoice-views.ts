import type { AssociationInvoice, ListQuery, PlatformInvoice } from '@cotiz/contracts';
import { invoices } from '@cotiz/db';
import { Money } from '@cotiz/domain';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { type Cursor, decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type InvoiceRow = typeof invoices.$inferSelect;

/** Clé de tri des curseurs : `created_at` au texte exact de PostgreSQL (microsecondes, UTC). */
const createdAtText = sql<string>`to_char(${invoices.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'`;

/** Position d'une liste de factures ; aucun tri au choix (plus récentes d'abord). */
function invoiceListPosition(query: z.infer<typeof ListQuery>): Cursor | null {
  if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
  if (query.cursor === undefined) return null;
  const cursor = decodeCursor(query.cursor);
  if (!cursor) throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
  return cursor;
}

/**
 * Page de factures, les plus récentes d'abord (`created_at`, `id`), sous les filtres donnés ; dans la transaction de
 * l'appelant (RLS de son espace : l'association, ou toutes pour cotiz_platform).
 */
export async function invoicePage(
  where: SQL | undefined,
  query: z.infer<typeof ListQuery>,
): Promise<{ rows: InvoiceRow[]; nextCursor: string | null; total: number }> {
  const after = invoiceListPosition(query);
  const tx = currentTx();
  const position = after
    ? sql`(${invoices.createdAt}, ${invoices.id}) < (${after.at}::timestamptz, ${after.id}::uuid)`
    : undefined;
  const rows = await tx
    .select({ row: invoices, at: createdAtText })
    .from(invoices)
    .where(and(where, position))
    .orderBy(desc(invoices.createdAt), desc(invoices.id))
    .limit(query.limit + 1);
  const [count] = await tx
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(invoices)
    .where(where);
  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    rows: page.map((r) => r.row),
    nextCursor: rows.length > query.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
    total: count?.n ?? 0,
  };
}

/** Facture telle que l'association la voit (bl.inv). */
export function associationInvoiceOf(row: InvoiceRow): z.infer<typeof AssociationInvoice> {
  return {
    id: row.id,
    number: row.number,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    amount: Money.fromDb(row.amount, 'XOF'),
    status: row.status,
    issuedAt: row.issuedAt?.toISOString() ?? null,
    dueAt: row.dueAt?.toISOString() ?? null,
    paidAt: row.paidAt?.toISOString() ?? null,
    pdfFileId: row.pdfFileId,
  };
}

/** Facture telle que la plateforme la voit (pf.invoices, pf.invoice.paid). */
export function platformInvoiceOf(
  row: InvoiceRow,
  association: { id: string; name: string },
): z.infer<typeof PlatformInvoice> {
  return { ...associationInvoiceOf(row), association, paymentReference: row.paymentReference };
}

/** Factures d'une association : filtre explicite en plus de la RLS. */
export const ofAssociation = (associationId: string) => eq(invoices.associationId, associationId);
