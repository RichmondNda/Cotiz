import { Injectable } from '@nestjs/common';
import type { PaymentDetail, ValidatePaymentInput } from '@cotiz/contracts';
import { allocations, installments, payments as t, updateWithVersion } from '@cotiz/db';
import {
  type Allocation,
  byDueOrder,
  type Currency,
  DomainError,
  excludingPayment,
  installmentStatus,
  type LedgerInstallment,
  lateSince,
  Money,
  moveAllocations,
  proposeAllocation,
  validateAllocation,
} from '@cotiz/domain';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { lockFinancialTerms, projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { sqlErrorOf } from '../../../shared/logging/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { allocationProblem } from '../domain/allocation-problem.js';
import { GetPaymentUseCase } from './get-payment.use-case.js';
import type { PaymentRecord } from './payment-views.js';

type InstallmentRecord = typeof installments.$inferSelect;
/** Refus des contrôles différés de la base (check_payment_allocations) : codes du catalogue, jamais un 500. */
const DEFERRED_CODES = new Set(['allocation_mismatch', 'invalid_state']);

/**
 * lg.pay.validate (architecture/04 § 4.5) : dans une transaction,
 * 1. paiement verrouillé (FOR UPDATE) : absent ou d'une autre association → 404 ; déjà traité → 409
 *    payment_already_reviewed (prioritaire sur le 412) ; If-Match périmé → 412 ; puis projet verrouillé ;
 * 2. échéances de l'inscription (et celles visées hors inscription) verrouillées par id croissant, puis relues : une
 *    validation concurrente sur les mêmes échéances attend et voit les soldes à jour ;
 * 3. montant reçu ?? déclaré ≤ reste dû de l'inscription hors ce paiement (`amount_exceeds_remaining`, maxAmount),
 *    répartition finale (celle du souscripteur ou ajustée) contrôlée par validateAllocation() hors ce paiement ;
 * 4. propositions annulées, répartition confirmée, soldes par moveAllocations(), statuts par installmentStatus() ;
 * 5. paiement validé, conditions du projet figées, audit, payment.validated ; contrôles différés vérifiés ici.
 * Montant reçu égal au déclaré : enregistré comme absent.
 */
@Injectable()
export class ValidatePaymentUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly outbox: OutboxService,
    private readonly getPayment: GetPaymentUseCase,
  ) {}

  @Audited('payment.validate')
  async execute(aid: string, payId: string, input: z.infer<typeof ValidatePaymentInput>): Promise<PaymentDetail> {
    const actor = requireActor();
    const version = expectedVersion();
    const associationId = contextAssociationId(aid);
    const tx = currentTx();

    const [row] = await tx
      .select()
      .from(t)
      .where(and(eq(t.associationId, associationId), eq(t.id, payId)))
      .for('update');
    if (row?.associationId !== associationId) throw new DomainProblem('not_found');
    if (row.status !== 'pending') throw await this.alreadyReviewed(row);
    if (row.version !== version) throw new DomainProblem('version_conflict');

    // Verrous dans l'ordre paiement → projet → échéances par id (04-flows § 4.5), comme en.withdraw et en.create
    // (projet puis échéances) : aucun cycle. Projet relu sous verrou : délai de grâce à jour pour les statuts.
    const project = await projectOf(associationId, row.projectId, { lock: true });
    if (!project) throw new Error(`paiement ${row.id} : projet introuvable`);
    const currency = row.currency as Currency;
    const own: Allocation[] = (
      await tx
        .select({ installmentId: allocations.installmentId, amount: allocations.amount })
        .from(allocations)
        .where(
          and(
            eq(allocations.associationId, associationId),
            eq(allocations.paymentId, row.id),
            eq(allocations.state, 'proposed'),
          ),
        )
    ).map((a) => ({ installmentId: a.installmentId, amount: Money.fromDb(a.amount, currency).amount }));
    const final = input.allocations
      ? input.allocations.map((a) => ({
          installmentId: a.installmentId,
          amount: this.amountOf(a.amount, currency, `allocations.${a.installmentId}`),
        }))
      : own;
    const received = input.amountReceived
      ? this.amountOf(input.amountReceived, currency, 'amountReceived')
      : Money.fromDb(row.amountDeclared, currency).amount;
    if (received <= 0) throw new DomainProblem('validation_failed', { fields: { amountReceived: 'invalid_amount' } });

    // Verrous ordonnés : toutes les échéances de l'inscription (reste dû) et celles visées ailleurs (RLS : celles
    // d'une autre association restent invisibles, donc « pas ouvertes »).
    const finalIds = final.map((a) => a.installmentId);
    const locked = await tx
      .select()
      .from(installments)
      .where(
        and(
          eq(installments.associationId, associationId),
          or(
            eq(installments.enrollmentId, row.enrollmentId),
            finalIds.length === 0 ? undefined : inArray(installments.id, finalIds),
          ),
        ),
      )
      .orderBy(asc(installments.id))
      .for('update');
    const ledger = excludingPayment(
      locked.map((i) => toLedger(i, currency)),
      own,
    );

    const ofEnrollment = ledger.filter((i) => i.enrollmentId === row.enrollmentId);
    try {
      proposeAllocation(received, ofEnrollment);
    } catch (error) {
      if (error instanceof DomainError && error.code === 'amount_exceeds_remaining') {
        const { maxAmount } = error.details as { maxAmount: number };
        throw new DomainProblem('amount_exceeds_remaining', { maxAmount });
      }
      throw error;
    }
    const check = validateAllocation(received, final, ledger, { enrollmentId: row.enrollmentId });
    if (!check.ok) throw allocationProblem(check.errors);

    // Soldes et statuts : à partir des soldes stockés (le déclaré de ce paiement quitte le montant en attente).
    const stored = locked.map((i) => toLedger(i, currency));
    const today = await associationToday(associationId);
    const changed = moveAllocations(stored, { releasePending: own, addPaid: final });
    await tx
      .update(allocations)
      .set({ state: 'voided' })
      .where(
        and(
          eq(allocations.associationId, associationId),
          eq(allocations.paymentId, row.id),
          eq(allocations.state, 'proposed'),
        ),
      );
    await tx.insert(allocations).values(
      final.map((a) => ({
        associationId,
        paymentId: row.id,
        installmentId: a.installmentId,
        enrollmentId: row.enrollmentId,
        amount: BigInt(a.amount),
        state: 'confirmed' as const,
      })),
    );
    for (const i of changed) {
      const status = installmentStatus(i, today, project.graceDays);
      await tx
        .update(installments)
        .set({
          amountPaid: BigInt(i.amountPaid),
          amountPending: BigInt(i.amountPending),
          status,
          lateSince: status === 'late' ? lateSince(i, project.graceDays) : null,
          paidAt: status === 'paid' ? sql`coalesce(${installments.paidAt}, now())` : null,
        })
        .where(and(eq(installments.associationId, associationId), eq(installments.id, i.id)));
    }

    const amountReceived = received === Money.fromDb(row.amountDeclared, currency).amount ? null : received;
    const validated = await updateWithVersion(
      tx,
      t,
      { id: row.id, version },
      {
        status: 'validated',
        amountReceived: amountReceived === null ? null : BigInt(amountReceived),
        reviewedBy: actor.userId,
        reviewedAt: sql`now()`,
      },
    );
    if (!validated) throw new DomainProblem('not_found');
    await lockFinancialTerms(associationId, row.projectId);

    const covered = ledger
      .filter((i) => finalIds.includes(i.id))
      .sort(byDueOrder)
      .map((i) => i.id);
    await this.outbox.publish(tx, {
      type: 'payment.validated',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'payment', id: row.id },
      payload: { paymentId: row.id, userId: row.userId, amountReceived: received, installmentIds: covered },
    });
    recordAudit({
      entityType: 'payment',
      entityId: row.id,
      associationId,
      before: {
        status: row.status,
        version: row.version,
        amountReceived: row.amountReceived === null ? null : Money.fromDb(row.amountReceived, currency).amount,
        allocations: own,
      },
      after: { status: validated.status, version: validated.version, amountReceived, allocations: final },
    });
    await this.checkDeferred();
    return this.getPayment.execute(aid, row.id);
  }

  /** Montant saisi dans la devise du paiement (entier de sa plus petite unité), sinon 422 sur le champ. */
  private amountOf(money: { amount: number; currency: string }, currency: Currency, field: string): number {
    if (money.currency !== currency)
      throw new DomainProblem('validation_failed', { fields: { [field]: 'currency_mismatch' } });
    return money.amount;
  }

  /** 409 avec le nom de la personne qui a traité le paiement (errors.yaml : reviewerName, paymentStatus). */
  private async alreadyReviewed(row: PaymentRecord): Promise<DomainProblem> {
    const reviewer = row.reviewedBy
      ? (await this.accounts.contactsOf([row.reviewedBy])).get(row.reviewedBy)
      : undefined;
    return new DomainProblem('payment_already_reviewed', {
      reviewerName: reviewer ? `${reviewer.firstName} ${reviewer.lastName}`.trim() : null,
      paymentStatus: row.status,
    });
  }

  /** Contrôles différés (Σ confirmées = montant reçu…) vérifiés avant la fin du cas d'usage, traduits en Problem. */
  private async checkDeferred(): Promise<void> {
    try {
      await currentTx().execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
    } catch (error) {
      const pg = sqlErrorOf(error);
      if (pg?.code === 'P0001' && DEFERRED_CODES.has(pg.message)) {
        throw new DomainProblem(pg.message === 'allocation_mismatch' ? 'allocation_mismatch' : 'invalid_state');
      }
      throw error;
    }
  }
}

/** Échéance vue par le domaine : montants en entiers de la devise du paiement. */
function toLedger(i: InstallmentRecord, currency: Currency): LedgerInstallment {
  return {
    id: i.id,
    enrollmentId: i.enrollmentId,
    kind: i.kind,
    sequence: i.sequence,
    dueDate: i.dueDate,
    amountDue: Money.fromDb(i.amountDue, currency).amount,
    amountPaid: Money.fromDb(i.amountPaid, currency).amount,
    amountPending: Money.fromDb(i.amountPending, currency).amount,
    status: i.status,
  };
}
