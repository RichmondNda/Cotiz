import { Injectable, Logger } from '@nestjs/common';
import { files, invoices, plans, subscriptions } from '@cotiz/db';
import {
  type BillingPeriod,
  billingRun,
  invoiceNumber,
  isInvoiceOverdue,
  newId,
  subscriptionStatusAfterInvoices,
  todayIn,
} from '@cotiz/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { contextOwnerOf } from '../../access/access.public.js';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { BUCKETS } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/** Abonnements que la tâche fait avancer : essai, actif, impayé (suspendu et résilié : jamais facturés). */
const BILLED = ['trialing', 'active', 'past_due'] as const;

/** Échéance d'une facture : fin du jour `dueOn` dans le fuseau de l'association (`timestamptz`). */
const endOfLocalDay = (day: string, timezone: string) =>
  sql`((${day}::date + time '23:59:59') AT TIME ZONE ${timezone})`;

/**
 * Tâche `billing.issue-invoices` (jobs.yaml, lot 4.6 ; règles : `billingRun` de @cotiz/domain). Lancée toutes les
 * heures, rejouable : liste en espace system les abonnements en cours, puis traite chaque association dans son
 * contexte (invoices n'a que tenant_isolation), abonnement verrouillé (`FOR UPDATE`) :
 * 1. périodes : facture la période en cours si elle ne l'est pas, avance jusqu'à celle du jour (essai terminé →
 *    `active`), une facture `open` par période traversée, numéro tiré de `invoice_number_seq` (jamais réutilisé),
 *    ligne `files` du PDF en attente (cotiz-legal, produit par documents sur `subscription.invoice_issued`) ;
 * 2. retards : facture ouverte dont l'échéance est passée → `overdue` ; statut de l'abonnement selon ses impayés
 *    (`past_due` ↔ `active`).
 * Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise.
 */
@Injectable()
export class IssueInvoicesUseCase {
  private readonly logger = new Logger(IssueInvoicesUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(now: Date): Promise<{ issued: number }> {
    const due = await this.db.withTenantContext({ space: 'system' }, async () => {
      const rows = await currentTx()
        .selectDistinct({ associationId: subscriptions.associationId })
        .from(subscriptions)
        .where(inArray(subscriptions.status, BILLED));
      const timezones = await associationTimezonesOf(rows.map((r) => r.associationId));
      return [...timezones.entries()]
        .map(([id, timezone]) => ({ id, timezone }))
        .sort((a, b) => a.id.localeCompare(b.id));
    });
    let issued = 0;
    const failures: unknown[] = [];
    for (const association of due) {
      try {
        issued += await this.db.withTenantContext({ space: 'association', associationId: association.id }, () =>
          this.run(association.id, todayIn(association.timezone, now), association.timezone),
        );
      } catch (error) {
        this.logger.error({ msg: 'factures non émises', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (issued > 0) this.logger.log({ msg: 'factures émises', count: issued });
    if (failures.length > 0) {
      throw new AggregateError(failures, `billing.issue-invoices : ${String(failures.length)} association(s) en échec`);
    }
    return { issued };
  }

  /** Une association, dans son contexte ; renvoie le nombre de factures émises. */
  async run(associationId: string, today: string, timezone: string): Promise<number> {
    const tx = currentTx();
    const [subscription] = await tx
      .select({
        id: subscriptions.id,
        planId: subscriptions.planId,
        status: subscriptions.status,
        billingPeriod: subscriptions.billingPeriod,
        currentPeriodStart: subscriptions.currentPeriodStart,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(and(eq(subscriptions.associationId, associationId), inArray(subscriptions.status, BILLED)))
      .for('update');
    if (!subscription) return 0;
    const [plan] = await tx
      .select({ priceMonthly: plans.priceMonthly, priceYearly: plans.priceYearly })
      .from(plans)
      .where(eq(plans.id, subscription.planId));
    if (!plan) throw new Error(`abonnement ${subscription.id} : plan introuvable`);
    const billingPeriod: BillingPeriod = subscription.billingPeriod;
    const price = Number(billingPeriod === 'monthly' ? plan.priceMonthly : plan.priceYearly);

    const invoiced = await tx
      .select({ periodStart: invoices.periodStart })
      .from(invoices)
      .where(and(eq(invoices.associationId, associationId), eq(invoices.subscriptionId, subscription.id)));
    const owner = await contextOwnerOf(associationId);
    // Sans owner actif ou sans période en cours, l'association ne peut pas être facturée : ses périodes restent en
    // place (rien n'est perdu), ses retards sont quand même constatés, et la tâche ne s'arrête pas pour elle.
    const blocked = !owner ? 'aucun owner actif' : !subscription.currentPeriodEnd ? 'aucune période en cours' : null;
    if (blocked) this.logger.warn({ msg: 'association non facturée', associationId, reason: blocked });
    const run = blocked
      ? { invoices: [], period: null }
      : billingRun({
          status: subscription.status,
          billingPeriod,
          currentPeriodStart: subscription.currentPeriodStart,
          currentPeriodEnd: subscription.currentPeriodEnd,
          price,
          invoicedPeriodStarts: invoiced.map((i) => i.periodStart),
          today,
        });

    if (owner && run.invoices.length > 0) {
      const year = Number(today.slice(0, 4));
      for (const invoice of run.invoices) {
        const { rows } = await tx.execute<{ n: string }>(sql`SELECT nextval('invoice_number_seq')::text AS n`);
        const id = newId();
        const fileId = newId();
        await tx.insert(files).values({
          id: fileId,
          associationId,
          ownerUserId: owner,
          purpose: 'invoice_pdf',
          bucket: BUCKETS.invoice_pdf,
          objectKey: `${associationId}/invoice_pdf/${fileId}.pdf`,
          originalName: 'facture.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 0,
        });
        await tx.insert(invoices).values({
          id,
          associationId,
          subscriptionId: subscription.id,
          number: invoiceNumber(year, Number(rows[0]?.n)),
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          amount: BigInt(invoice.amount),
          status: 'open',
          issuedAt: sql`now()`,
          dueAt: endOfLocalDay(invoice.dueOn, timezone),
          pdfFileId: fileId,
        });
        await this.outbox.publish(tx, {
          type: 'subscription.invoice_issued',
          associationId,
          actorUserId: null,
          aggregate: { type: 'invoice', id },
          payload: { invoiceId: id, associationId },
        });
      }
    }

    // Retards : jour d'échéance lu dans le fuseau de l'association, règle isInvoiceOverdue.
    const open = await tx
      .select({
        id: invoices.id,
        dueOn: sql<string>`to_char(${invoices.dueAt} AT TIME ZONE ${timezone}, 'YYYY-MM-DD')`,
      })
      .from(invoices)
      .where(and(eq(invoices.associationId, associationId), eq(invoices.status, 'open')));
    const late = open.filter((i) => isInvoiceOverdue({ status: 'open', dueOn: i.dueOn }, today)).map((i) => i.id);
    if (late.length > 0) {
      // Garde de statut : une facture réglée ou annulée entre la lecture et l'écriture reste comme elle est.
      await tx
        .update(invoices)
        .set({ status: 'overdue' })
        .where(and(inArray(invoices.id, late), eq(invoices.status, 'open')));
    }
    const [overdue] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(invoices)
      .where(and(eq(invoices.subscriptionId, subscription.id), eq(invoices.status, 'overdue')));
    const status = subscriptionStatusAfterInvoices(run.period?.status ?? subscription.status, {
      overdueCount: overdue?.n ?? 0,
    });

    if (run.period || status !== subscription.status) {
      await tx
        .update(subscriptions)
        .set({
          status,
          ...(run.period && {
            currentPeriodStart: run.period.currentPeriodStart,
            currentPeriodEnd: run.period.currentPeriodEnd,
          }),
        })
        .where(eq(subscriptions.id, subscription.id));
    }
    return run.invoices.length;
  }
}
