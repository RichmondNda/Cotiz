import { Injectable } from '@nestjs/common';
import { files, payments } from '@cotiz/db';
import { formatMoney, Money, newId, revertDeadline, todayIn } from '@cotiz/domain';
import type { ReceiptDocumentInput } from '@cotiz/pdf-templates';
import { and, eq } from 'drizzle-orm';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { BUCKETS } from '../../../shared/storage/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { paymentRefsOf } from './payment-views.js';

/** Où en est le reçu d'un paiement : rien à produire, trop tôt (délai d'annulation), ou prêt à rendre. */
export type ReceiptPreparation =
  | { status: 'skip' }
  | { status: 'early'; retryAt: Date }
  | { status: 'ready'; fileId: string; input: ReceiptDocumentInput };

/**
 * Reçu d'un paiement validé (lot 4.6, documents) dans le contexte de son association : paiement verrouillé (premier
 * verrou de l'ordre paiement → projet → échéances), encore validé, délai d'annulation (10 min, `revertDeadline`)
 * écoulé ; sinon `skip` ou `early`. Le fichier `receipt_pdf` (cotiz-legal, en attente, au souscripteur) est réservé une
 * seule fois et posé sur le paiement (`payments.receipt_file_id`, payments_guard) ; un rejeu retrouve le même.
 * Montants en XOF (`payments_currency_xof`).
 */
@Injectable()
export class PaymentReceipts {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async prepare(associationId: string, paymentId: string, now: Date): Promise<ReceiptPreparation> {
    const context = currentContext();
    if (context?.space !== 'association' || context.associationId !== associationId) {
      throw new Error('PaymentReceipts.prepare : contexte de cette association attendu');
    }
    const tx = currentTx();
    const [row] = await tx
      .select()
      .from(payments)
      .where(and(eq(payments.id, paymentId), eq(payments.associationId, associationId)))
      .for('update');
    if (row?.status !== 'validated') return { status: 'skip' };
    const deadline = revertDeadline(row);
    if (!deadline || !row.reviewedAt) return { status: 'skip' };
    if (now.getTime() <= deadline.getTime()) return { status: 'early', retryAt: deadline };
    const association = await ownAssociationOf(associationId);
    if (!association) return { status: 'skip' };

    let fileId = row.receiptFileId;
    if (!fileId) {
      fileId = newId();
      await tx.insert(files).values({
        id: fileId,
        associationId,
        ownerUserId: row.userId,
        purpose: 'receipt_pdf',
        bucket: BUCKETS.receipt_pdf,
        objectKey: `${associationId}/receipt_pdf/${fileId}.pdf`,
        originalName: 'recu.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 0,
      });
      await tx.update(payments).set({ receiptFileId: fileId }).where(eq(payments.id, row.id));
    }

    const refs = await paymentRefsOf(associationId, [row], this.accounts);
    const project = refs.projects.get(row.projectId);
    const person = refs.people.get(row.userId);
    const method = row.paymentMethodId ? refs.methods.get(row.paymentMethodId) : undefined;
    const tz = association.timezone;
    const lines = (refs.lines.get(row.id) ?? [])
      .filter((l) => l.state === 'confirmed')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return {
      status: 'ready',
      fileId,
      input: {
        paymentId: row.id,
        issuedOn: todayIn(tz, now),
        paidOn: row.paidOn,
        validatedOn: todayIn(tz, row.reviewedAt),
        association: { name: association.name, city: association.city, country: association.country },
        subscriber: { name: person ? `${person.firstName} ${person.lastName}` : '' },
        project: { name: project?.name ?? '' },
        methodLabel: method?.label ?? null,
        transactionReference: row.transactionReference,
        amountText: formatMoney(Money.fromDb(row.amountReceived ?? row.amountDeclared, 'XOF')),
        lines: lines.map((l) => ({ dueOn: l.dueDate, amountText: formatMoney(Money.fromDb(l.amount, 'XOF')) })),
      },
    };
  }
}
