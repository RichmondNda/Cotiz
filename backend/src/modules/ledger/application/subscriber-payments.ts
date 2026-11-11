import type { SubscriberPayment } from '@cotiz/contracts';
import { files, payments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, count, desc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm';
import { subscriberPaymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { type Cursor, encodeCursor } from '../../../shared/pagination/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { coveredOf, paymentLinesOf } from './payment-views.js';

/** Références que l'appelant a déjà lues (inscriptions du souscripteur) : projet et association de chaque paiement. */
export interface SubscriberPaymentRefs {
  projects: ReadonlyMap<string, { id: string; name: string }>;
  associations: ReadonlyMap<string, { id: string; name: string; logoFileId: string | null; suspended: boolean }>;
  /** Inscriptions retirées parmi celles présentées (me.history, me.payment) : paiements en lecture seule. */
  withdrawnEnrollments?: ReadonlySet<string>;
}

type RejectionReason = NonNullable<SubscriberPayment['rejection']>['reasonCode'];

/** Période sur la date du virement (`paidOn`), bornes comprises (me.history, lot 3.4). */
export interface PaidOnPeriod {
  from?: string;
  to?: string;
}

/**
 * Filtres communs : la personne du contexte, ses inscriptions et les références présentées, la période ; `null` si
 * rien n'est à présenter (aucune inscription ou référence).
 */
function selection(
  enrollmentIds: readonly string[],
  refs: SubscriberPaymentRefs,
  period: PaidOnPeriod = {},
): SQL | null {
  const context = currentContext();
  if (context?.space !== 'subscriber' || !context.userId) {
    throw new Error('subscriberPaymentsOf : espace souscripteur seulement');
  }
  if (enrollmentIds.length === 0 || refs.projects.size === 0 || refs.associations.size === 0) return null;
  const where = and(
    // Redondant avec les inscriptions (FK composite payments → enrollments, même user_id) : défense en profondeur.
    eq(payments.userId, context.userId),
    inArray(payments.enrollmentId, [...new Set(enrollmentIds)]),
    inArray(payments.projectId, [...refs.projects.keys()]),
    inArray(payments.associationId, [...refs.associations.keys()]),
    period.from === undefined ? undefined : gte(payments.paidOn, period.from),
    period.to === undefined ? undefined : lte(payments.paidOn, period.to),
  );
  // Jamais vide : au moins le filtre user_id.
  if (!where) throw new Error('subscriberPaymentsOf : sélection vide');
  return where;
}

/**
 * Paiements déclarés par le souscripteur connecté (espace subscriber, RLS `subscriber_self_read`), sur ces
 * inscriptions, les plus récents d'abord (date de déclaration, puis identifiant) ; `limit` : les premiers seulement.
 * Un paiement dont le projet ou l'association n'est pas dans `refs` n'est pas présenté. `ids` : ceux-là seulement.
 */
export async function subscriberPaymentsOf(
  enrollmentIds: readonly string[],
  refs: SubscriberPaymentRefs,
  options: { limit?: number; ids?: readonly string[] } = {},
): Promise<SubscriberPayment[]> {
  const where = selection(enrollmentIds, refs);
  if (!where) return [];
  const query = currentTx()
    .select()
    .from(payments)
    .where(and(where, options.ids === undefined ? undefined : inArray(payments.id, [...options.ids])))
    .orderBy(desc(payments.declaredAt), desc(payments.id));
  const rows = options.limit === undefined ? await query : await query.limit(options.limit);
  return viewsOf(rows, refs);
}

/**
 * Une page de l'historique (me.history) : même ordre que `subscriberPaymentsOf`, tous statuts, période sur `paidOn` ;
 * `after` = position de la dernière ligne de la page précédente (curseur `(declared_at, id)`), `total` = toute la
 * sélection.
 */
export async function subscriberPaymentsPage(
  enrollmentIds: readonly string[],
  refs: SubscriberPaymentRefs,
  options: PaidOnPeriod & { limit: number; after: Cursor | null },
): Promise<{ items: SubscriberPayment[]; nextCursor: string | null; total: number }> {
  const where = selection(enrollmentIds, refs, options);
  if (!where) return { items: [], nextCursor: null, total: 0 };
  const tx = currentTx();
  const after = options.after
    ? sql`(${payments.declaredAt}, ${payments.id}) < (${options.after.at}::timestamptz, ${options.after.id}::uuid)`
    : undefined;
  const rows = await tx
    .select({ row: payments, at: sql<string>`${payments.declaredAt}::text` })
    .from(payments)
    .where(and(where, after))
    .orderBy(desc(payments.declaredAt), desc(payments.id))
    .limit(options.limit + 1);
  const [totals] = await tx.select({ n: count() }).from(payments).where(where);
  const page = rows.slice(0, options.limit);
  const last = page.at(-1);
  return {
    items: await viewsOf(
      page.map((r) => r.row),
      refs,
    ),
    nextCursor: rows.length > options.limit && last ? encodeCursor({ at: last.at, id: last.row.id }) : null,
    total: totals?.n ?? 0,
  };
}

/** Versements validés de la sélection (me.history) : montant reçu (`amount_received`, sinon le déclaré), en entiers. */
export async function subscriberValidatedPaymentsOf(
  enrollmentIds: readonly string[],
  refs: SubscriberPaymentRefs,
  period: PaidOnPeriod = {},
): Promise<{ paidOn: string; projectId: string; amount: number; currency: Currency }[]> {
  const where = selection(enrollmentIds, refs, period);
  if (!where) return [];
  const rows = await currentTx()
    .select({
      paidOn: payments.paidOn,
      projectId: payments.projectId,
      amountDeclared: payments.amountDeclared,
      amountReceived: payments.amountReceived,
      currency: payments.currency,
    })
    .from(payments)
    .where(and(where, eq(payments.status, 'validated')));
  return rows.map((r) => {
    const currency = r.currency as Currency;
    return {
      paidOn: r.paidOn,
      projectId: r.projectId,
      amount: Money.fromDb(r.amountReceived ?? r.amountDeclared, currency).amount,
      currency,
    };
  });
}

async function viewsOf(
  rows: (typeof payments.$inferSelect)[],
  refs: SubscriberPaymentRefs,
): Promise<SubscriberPayment[]> {
  if (rows.length === 0) return [];
  const tx = currentTx();
  const methods = new Map(
    rows.some((r) => r.paymentMethodId)
      ? (await subscriberPaymentMethodsOf(rows.map((r) => r.associationId))).map((m) => [m.id, m.kind])
      : [],
  );
  const proofIds = rows.flatMap((r) => (r.proofFileId ? [r.proofFileId] : []));
  // Preuves : celles que la personne a déposées (RLS `owner_access`) ; une autre reste sans nom.
  const proofs = new Map(
    proofIds.length === 0
      ? []
      : (
          await tx
            .select({ id: files.id, name: files.originalName, mimeType: files.mimeType })
            .from(files)
            .where(inArray(files.id, proofIds))
        ).map((p) => [p.id, p]),
  );
  const lines = await paymentLinesOf(rows.map((r) => r.id));
  return rows.map((row) => {
    const currency = row.currency as Currency;
    const project = refs.projects.get(row.projectId);
    const association = refs.associations.get(row.associationId);
    if (!project || !association) throw new Error(`paiement ${row.id} : références introuvables`);
    const proof = row.proofFileId ? proofs.get(row.proofFileId) : undefined;
    return {
      id: row.id,
      status: row.status,
      amountDeclared: Money.fromDb(row.amountDeclared, currency),
      amountReceived: row.amountReceived === null ? null : Money.fromDb(row.amountReceived, currency),
      paidOn: row.paidOn,
      declaredAt: row.declaredAt.toISOString(),
      paymentMethodKind: (row.paymentMethodId ? methods.get(row.paymentMethodId) : null) ?? null,
      project: { id: project.id, name: project.name },
      association: {
        id: association.id,
        name: association.name,
        logoFileId: association.logoFileId,
        suspended: association.suspended,
      },
      covered: coveredOf(row, lines.get(row.id) ?? [], currency),
      proof: {
        fileId: row.proofFileId,
        fileName: proof?.name ?? null,
        mimeType: proof?.mimeType ?? null,
        transactionReference: row.transactionReference,
      },
      rejection:
        row.status === 'rejected' && row.rejectionReasonCode
          ? { reasonCode: row.rejectionReasonCode as RejectionReason, message: row.rejectionMessage }
          : null,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      enrollmentWithdrawn: refs.withdrawnEnrollments?.has(row.enrollmentId) ?? false,
    };
  });
}
