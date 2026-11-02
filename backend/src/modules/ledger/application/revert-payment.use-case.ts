import { Injectable } from '@nestjs/common';
import type { PaymentDetail } from '@cotiz/contracts';
import { payments as t, updateWithVersion } from '@cotiz/db';
import { canRevert, type Currency, DomainError, type LedgerInstallment, Money, moveAllocations } from '@cotiz/domain';
import { and, eq, ne, sql } from 'drizzle-orm';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { projectOf, unlockFinancialTerms } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { GetPaymentUseCase } from './get-payment.use-case.js';
import {
  allocationsOf,
  checkDeferred,
  declaredAllocationsOf,
  insertAllocations,
  lockInstallments,
  lockPayment,
  voidAllocations,
  writeBalances,
} from './payment-review.js';

/**
 * lg.pay.revert (architecture/04 § 4.5, Annulation ; décision C6) : opération compensatoire, jamais une suppression.
 * Mêmes verrous que la validation (paiement → projet → échéances par id). Validé seulement (sinon 409 invalid_state),
 * par la personne qui a validé (403 not_reviewer), dans les 10 minutes incluses (409 revert_window_expired, canRevert).
 * Répartition confirmée annulée et retirée du versé ; répartition de la déclaration reproposée (refusée en 409
 * invalid_state si elle ne rentre plus : échéance redéclarée, dispensée ou annulée depuis) ; paiement de nouveau en
 * attente, montant reçu et relecteur effacés ; conditions du projet libérées si cette validation les avait figées et
 * qu'aucun autre paiement du projet n'est validé ; audit, payment.reverted.
 */
@Injectable()
export class RevertPaymentUseCase {
  constructor(
    private readonly outbox: OutboxService,
    private readonly getPayment: GetPaymentUseCase,
  ) {}

  @Audited('payment.reverted')
  async execute(aid: string, payId: string): Promise<PaymentDetail> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);

    const row = await lockPayment(associationId, payId);
    if (row.status !== 'validated') throw new DomainProblem('invalid_state');
    if (row.reviewedBy !== actor.userId) throw new DomainProblem('not_reviewer');
    if (!canRevert(row, actor.userId, new Date())) throw new DomainProblem('revert_window_expired');
    const project = await projectOf(associationId, row.projectId, { lock: true });
    if (!project) throw new Error(`paiement ${row.id} : projet introuvable`);
    const currency = row.currency as Currency;
    const confirmed = await allocationsOf(associationId, row.id, 'confirmed', currency);
    const declared = await declaredAllocationsOf(associationId, row.id, currency);
    const stored = await lockInstallments(associationId, row.enrollmentId, currency);

    const targets = new Set(declared.map((a) => a.installmentId));
    if (stored.some((i) => targets.has(i.id) && (i.status === 'waived' || i.status === 'canceled'))) {
      throw new DomainProblem('invalid_state');
    }
    let changed: LedgerInstallment[];
    try {
      changed = moveAllocations(stored, { releasePaid: confirmed, addPending: declared });
    } catch (error) {
      // Déclaration qui dépasse désormais le dû (déclaré ailleurs entre-temps) ou échéance disparue.
      if (error instanceof DomainError) throw new DomainProblem('invalid_state');
      throw error;
    }
    await voidAllocations(associationId, row.id, 'confirmed');
    await insertAllocations(row, declared, 'proposed');
    await writeBalances(associationId, changed, await associationToday(associationId), project.graceDays);

    const [{ reviewedAt } = { reviewedAt: null }] = await currentTx()
      .select({ reviewedAt: sql<string | null>`${t.reviewedAt}::text` })
      .from(t)
      .where(and(eq(t.associationId, associationId), eq(t.id, row.id)));
    const reverted = await updateWithVersion(
      currentTx(),
      t,
      { id: row.id, version: row.version },
      { status: 'pending', amountReceived: null, reviewedBy: null, reviewedAt: null },
    );
    if (!reverted) throw new DomainProblem('not_found');
    const [otherValidated] = await currentTx()
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.associationId, associationId),
          eq(t.projectId, row.projectId),
          eq(t.status, 'validated'),
          ne(t.id, row.id),
        ),
      )
      .limit(1);
    if (!otherValidated && reviewedAt) await unlockFinancialTerms(associationId, row.projectId, reviewedAt);

    await this.outbox.publish(currentTx(), {
      type: 'payment.reverted',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'payment', id: row.id },
      payload: { paymentId: row.id, revertedBy: actor.userId },
    });
    recordAudit({
      entityType: 'payment',
      entityId: row.id,
      associationId,
      before: {
        status: row.status,
        version: row.version,
        amountReceived: row.amountReceived === null ? null : Money.fromDb(row.amountReceived, currency).amount,
        allocations: confirmed,
      },
      after: { status: reverted.status, version: reverted.version, amountReceived: null, allocations: declared },
    });
    await checkDeferred();
    return this.getPayment.execute(aid, row.id);
  }
}
