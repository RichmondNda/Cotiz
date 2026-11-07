import type { SubscriberPayment } from '@cotiz/contracts';
import { files, payments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { subscriberPaymentMethodsOf } from '../../tenancy/tenancy.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { coveredOf, paymentLinesOf } from './payment-views.js';

/** Références que l'appelant a déjà lues (inscriptions du souscripteur) : projet et association de chaque paiement. */
export interface SubscriberPaymentRefs {
  projects: ReadonlyMap<string, { id: string; name: string }>;
  associations: ReadonlyMap<string, { id: string; name: string; logoFileId: string | null }>;
}

type RejectionReason = NonNullable<SubscriberPayment['rejection']>['reasonCode'];

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
  const context = currentContext();
  if (context?.space !== 'subscriber' || !context.userId) {
    throw new Error('subscriberPaymentsOf : espace souscripteur seulement');
  }
  if (enrollmentIds.length === 0 || refs.projects.size === 0 || refs.associations.size === 0) return [];
  const tx = currentTx();
  const query = tx
    .select()
    .from(payments)
    .where(
      and(
        // Redondant avec les inscriptions (FK composite payments → enrollments, même user_id) : défense en profondeur.
        eq(payments.userId, context.userId),
        inArray(payments.enrollmentId, [...new Set(enrollmentIds)]),
        inArray(payments.projectId, [...refs.projects.keys()]),
        inArray(payments.associationId, [...refs.associations.keys()]),
        options.ids === undefined ? undefined : inArray(payments.id, [...options.ids]),
      ),
    )
    .orderBy(desc(payments.declaredAt), desc(payments.id));
  const rows = options.limit === undefined ? await query : await query.limit(options.limit);
  if (rows.length === 0) return [];
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
      association: { id: association.id, name: association.name, logoFileId: association.logoFileId },
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
    };
  });
}
