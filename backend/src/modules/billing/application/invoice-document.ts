import { invoices, plans, subscriptions } from '@cotiz/db';
import { formatMoney, Money } from '@cotiz/domain';
import type { InvoiceDocumentInput } from '@cotiz/pdf-templates';
import { and, eq, sql } from 'drizzle-orm';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Données du PDF d'une facture (documents, `subscription.invoice_issued`), dans le contexte de son association ;
 * `null` si la facture n'existe pas (ou plus de fichier). Dates lues dans le fuseau de l'association ; prix du plan
 * déjà figé dans le montant de la facture.
 */
export async function invoiceDocumentOf(
  associationId: string,
  invoiceId: string,
): Promise<{ pdfFileId: string; input: InvoiceDocumentInput } | null> {
  const association = await ownAssociationOf(associationId);
  if (!association) return null;
  const tz = association.timezone;
  const [row] = await currentTx()
    .select({
      number: invoices.number,
      periodStart: invoices.periodStart,
      periodEnd: invoices.periodEnd,
      amount: invoices.amount,
      pdfFileId: invoices.pdfFileId,
      issuedOn: sql<string>`to_char(${invoices.issuedAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      dueOn: sql<string>`to_char(${invoices.dueAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      planName: plans.name,
      billingPeriod: subscriptions.billingPeriod,
    })
    .from(invoices)
    .innerJoin(subscriptions, eq(subscriptions.id, invoices.subscriptionId))
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.associationId, associationId)));
  if (!row?.pdfFileId) return null;
  return {
    pdfFileId: row.pdfFileId,
    input: {
      number: row.number,
      issuedOn: row.issuedOn,
      dueOn: row.dueOn,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      association: {
        name: association.name,
        city: association.city,
        country: association.country,
        email: association.contactEmail,
      },
      plan: { name: row.planName, billingPeriod: row.billingPeriod },
      amountText: formatMoney(Money.fromDb(row.amount, 'XOF')),
    },
  };
}

/** Ce qu'une notification dit d'une facture (owner de l'association), dans son contexte ; `null` si elle n'existe pas. */
export async function invoiceNoticeOf(
  associationId: string,
  invoiceId: string,
): Promise<{ id: string; number: string; amount: Money; dueOn: string; paidOn: string | null } | null> {
  const association = await ownAssociationOf(associationId);
  if (!association) return null;
  const tz = association.timezone;
  const [row] = await currentTx()
    .select({
      number: invoices.number,
      amount: invoices.amount,
      dueOn: sql<string>`to_char(${invoices.dueAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
      paidOn: sql<string | null>`to_char(${invoices.paidAt} AT TIME ZONE ${tz}, 'YYYY-MM-DD')`,
    })
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.associationId, associationId)));
  if (!row) return null;
  return {
    id: invoiceId,
    number: row.number,
    amount: Money.fromDb(row.amount, 'XOF'),
    dueOn: row.dueOn,
    paidOn: row.paidOn,
  };
}
