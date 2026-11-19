import { Injectable } from '@nestjs/common';
import type { PlatformInvoice } from '@cotiz/contracts';
import { invoices, subscriptions } from '@cotiz/db';
import { isInvoiceOverdue, subscriptionStatusAfterInvoices, todayIn } from '@cotiz/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { associationTimezonesOf, platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { platformInvoiceOf } from './invoice-views.js';

/** Factures qu'on peut marquer payées : ouvertes ou en retard. */
const PAYABLE = new Set(['open', 'overdue']);

/**
 * pf.invoice.paid : marquage manuel d'une facture payée (aucun paiement en ligne : l'association a réglé hors
 * plateforme). Abonnement puis facture verrouillés (`FOR UPDATE`, ordre de la tâche) ; ni ouverte ni en retard → 409 `invalid_state` ; inconnue → 404 ;
 * date de paiement après aujourd'hui (fuseau de l'association) → 422. `paid_at` = début du jour payé dans ce fuseau.
 * L'abonnement impayé redevient actif quand il n'a plus de facture en retard, ni d'ouverte déjà échue (`subscriptionStatusAfterInvoices`).
 * Événement `subscription.invoice_paid` (notification de l'owner), audit avant/après.
 */
@Injectable()
export class MarkInvoicePaidUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('invoice.mark_paid')
  async execute(
    id: string,
    input: { paidOn: string; paymentReference?: string | undefined },
  ): Promise<z.infer<typeof PlatformInvoice>> {
    if (currentContext()?.space !== 'platform') throw new Error('pf.invoice.paid : espace plateforme seulement');
    const actor = requireActor();
    const tx = currentTx();
    // Ordre des verrous de la facturation : abonnement puis factures (comme billing.issue-invoices), sinon
    // interblocage avec le passage horaire qui verrouille l'abonnement avant de passer une facture en retard.
    const [target] = await tx
      .select({ subscriptionId: invoices.subscriptionId })
      .from(invoices)
      .where(eq(invoices.id, id));
    if (!target) throw new DomainProblem('not_found');
    const [subscription] = await tx
      .select({ id: subscriptions.id, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.id, target.subscriptionId))
      .for('update');
    const [invoice] = await tx.select().from(invoices).where(eq(invoices.id, id)).for('update');
    if (!invoice) throw new DomainProblem('not_found');
    if (!PAYABLE.has(invoice.status)) throw new DomainProblem('invalid_state');
    const timezone = (await associationTimezonesOf([invoice.associationId])).get(invoice.associationId);
    if (!timezone) throw new DomainProblem('not_found');
    const today = todayIn(timezone);
    if (input.paidOn > today) {
      throw new DomainProblem('validation_failed', { fields: { paidOn: 'in_future' } });
    }
    const reference = input.paymentReference?.trim() ? input.paymentReference.trim() : null;
    const [paid] = await tx
      .update(invoices)
      .set({
        status: 'paid',
        paidAt: sql`(${input.paidOn}::date::timestamp AT TIME ZONE ${timezone})`,
        paymentReference: reference,
      })
      .where(eq(invoices.id, invoice.id))
      .returning();
    if (!paid) throw new Error('pf.invoice.paid : facture disparue sous verrou');

    if (subscription) {
      // Impayés restants : en retard, ou encore ouvertes mais échues (le passage horaire ne les a pas encore vues).
      const unpaid = await tx
        .select({
          status: invoices.status,
          dueOn: sql<string>`to_char(${invoices.dueAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`,
        })
        .from(invoices)
        .where(and(eq(invoices.subscriptionId, subscription.id), inArray(invoices.status, ['open', 'overdue'])));
      const overdueCount = unpaid.filter(
        (i) => i.status === 'overdue' || isInvoiceOverdue({ status: 'open', dueOn: i.dueOn }, today),
      ).length;
      const status = subscriptionStatusAfterInvoices(subscription.status, { overdueCount });
      if (status !== subscription.status) {
        await tx.update(subscriptions).set({ status }).where(eq(subscriptions.id, subscription.id));
      }
    }

    await this.outbox.publish(tx, {
      type: 'subscription.invoice_paid',
      associationId: invoice.associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'invoice', id: invoice.id },
      payload: { invoiceId: invoice.id },
    });
    recordAudit({
      entityType: 'invoice',
      entityId: invoice.id,
      associationId: invoice.associationId,
      before: { status: invoice.status, paidAt: invoice.paidAt, paymentReference: invoice.paymentReference },
      after: { status: 'paid', paidOn: input.paidOn, paymentReference: reference },
    });
    const association = await platformAssociationOf(invoice.associationId);
    return platformInvoiceOf(paid, { id: invoice.associationId, name: association?.name ?? '' });
  }
}
