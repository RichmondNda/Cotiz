import { payments } from '@cotiz/db';
import { type Currency, Money } from '@cotiz/domain';
import { and, count, eq } from 'drizzle-orm';
import { projectOf } from '../../projects/projects.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

function assertAssociation(what: string, associationId: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de cette association seulement`);
  }
}

/** Ce qu'une notification dit d'un paiement (lot 2.5) : jamais de preuve, de référence ni de commentaire. */
export interface PaymentNotice {
  paymentId: string;
  userId: string;
  projectId: string;
  projectName: string;
  /**
   * Montant déclaré : immuable (trigger de schema.sql). Le montant reçu d'une validation se lit dans l'événement
   * `payment.validated`, jamais sur la ligne relue plus tard (une annulation l'efface).
   */
  declared: Money;
}

/**
 * Paiement d'une association, lu dans le contexte de cette association (RLS) ; `null` s'il n'existe pas (ou plus).
 * Pour le texte des notifications (consommateurs du module notifications).
 */
export async function paymentNoticeOf(associationId: string, paymentId: string): Promise<PaymentNotice | null> {
  assertAssociation('paymentNoticeOf', associationId);
  const [row] = await currentTx()
    .select({
      id: payments.id,
      userId: payments.userId,
      projectId: payments.projectId,
      amountDeclared: payments.amountDeclared,
      currency: payments.currency,
    })
    .from(payments)
    .where(and(eq(payments.associationId, associationId), eq(payments.id, paymentId)));
  if (!row) return null;
  const project = await projectOf(associationId, row.projectId);
  if (!project) return null;
  return {
    paymentId: row.id,
    userId: row.userId,
    projectId: row.projectId,
    projectName: project.name,
    declared: Money.fromDb(row.amountDeclared, row.currency as Currency),
  };
}

/** Paiements en attente de validation de l'association (titre du récapitulatif des déclarations). */
export async function pendingPaymentsCountOf(associationId: string): Promise<number> {
  assertAssociation('pendingPaymentsCountOf', associationId);
  const [row] = await currentTx()
    .select({ n: count() })
    .from(payments)
    .where(and(eq(payments.associationId, associationId), eq(payments.status, 'pending')));
  return row?.n ?? 0;
}
