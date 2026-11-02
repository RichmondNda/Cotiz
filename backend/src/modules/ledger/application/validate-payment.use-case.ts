import { Injectable } from '@nestjs/common';
import type { PaymentDetail, ValidatePaymentInput } from '@cotiz/contracts';
import { payments as t, updateWithVersion } from '@cotiz/db';
import {
  type Allocation,
  byDueOrder,
  type Currency,
  DomainError,
  excludingPayment,
  Money,
  moveAllocations,
  proposeAllocation,
  validateAllocation,
} from '@cotiz/domain';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { lockFinancialTerms, projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { allocationProblem } from '../domain/allocation-problem.js';
import { GetPaymentUseCase } from './get-payment.use-case.js';
import {
  allocationsOf,
  alreadyReviewed,
  checkDeferred,
  insertAllocations,
  lockInstallments,
  lockPayment,
  voidAllocations,
  writeBalances,
} from './payment-review.js';

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

    const row = await lockPayment(associationId, payId);
    if (row.status !== 'pending') throw await alreadyReviewed(row, this.accounts);
    if (row.version !== version) throw new DomainProblem('version_conflict');

    // Verrous dans l'ordre paiement → projet → échéances par id (04-flows § 4.5), comme en.withdraw et en.create
    // (projet puis échéances) : aucun cycle. Projet relu sous verrou : délai de grâce à jour pour les statuts.
    const project = await projectOf(associationId, row.projectId, { lock: true });
    if (!project) throw new Error(`paiement ${row.id} : projet introuvable`);
    const currency = row.currency as Currency;
    const own = await allocationsOf(associationId, row.id, 'proposed', currency);
    const final: Allocation[] = input.allocations
      ? input.allocations.map((a) => ({
          installmentId: a.installmentId,
          amount: this.amountOf(a.amount, currency, `allocations.${a.installmentId}`),
        }))
      : own;
    const declared = Money.fromDb(row.amountDeclared, currency).amount;
    const received = input.amountReceived ? this.amountOf(input.amountReceived, currency, 'amountReceived') : declared;
    if (received <= 0) throw new DomainProblem('validation_failed', { fields: { amountReceived: 'invalid_amount' } });

    // Toutes les échéances de l'inscription (reste dû) et celles visées ailleurs (« pas ouvertes »).
    const finalIds = final.map((a) => a.installmentId);
    const stored = await lockInstallments(associationId, row.enrollmentId, currency, finalIds);
    const ledger = excludingPayment(stored, own);

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
    const changed = moveAllocations(stored, { releasePending: own, addPaid: final });
    await voidAllocations(associationId, row.id, 'proposed');
    await insertAllocations(row, final, 'confirmed');
    await writeBalances(associationId, changed, await associationToday(associationId), project.graceDays);

    const amountReceived = received === declared ? null : received;
    const validated = await updateWithVersion(
      currentTx(),
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
    await this.outbox.publish(currentTx(), {
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
    await checkDeferred();
    return this.getPayment.execute(aid, row.id);
  }

  /** Montant saisi dans la devise du paiement (entier de sa plus petite unité), sinon 422 sur le champ. */
  private amountOf(money: { amount: number; currency: string }, currency: Currency, field: string): number {
    if (money.currency !== currency)
      throw new DomainProblem('validation_failed', { fields: { [field]: 'currency_mismatch' } });
    return money.amount;
  }
}
