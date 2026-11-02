import { Injectable } from '@nestjs/common';
import type { PaymentDetail, RejectPaymentInput } from '@cotiz/contracts';
import { payments as t, updateWithVersion } from '@cotiz/db';
import { type Currency, moveAllocations } from '@cotiz/domain';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, expectedVersion, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { GetPaymentUseCase } from './get-payment.use-case.js';
import {
  allocationsOf,
  alreadyReviewed,
  checkDeferred,
  lockInstallments,
  lockPayment,
  voidAllocations,
  writeBalances,
} from './payment-review.js';

/**
 * lg.pay.reject (architecture/04 § 4.5, Rejet) : dans une transaction, mêmes verrous que la validation (paiement →
 * projet → échéances par id) ; déjà traité → 409 payment_already_reviewed (prioritaire sur le 412) ; propositions
 * annulées, déclaré libéré des échéances (moveAllocations), statuts et date de retard recalculés ; motif enregistré,
 * audit, payment.rejected (sans le message, transmis par le détail du paiement).
 */
@Injectable()
export class RejectPaymentUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly outbox: OutboxService,
    private readonly getPayment: GetPaymentUseCase,
  ) {}

  @Audited('payment.reject')
  async execute(aid: string, payId: string, input: z.infer<typeof RejectPaymentInput>): Promise<PaymentDetail> {
    const actor = requireActor();
    const version = expectedVersion();
    const associationId = contextAssociationId(aid);

    const row = await lockPayment(associationId, payId);
    if (row.status !== 'pending') throw await alreadyReviewed(row, this.accounts);
    if (row.version !== version) throw new DomainProblem('version_conflict');
    const project = await projectOf(associationId, row.projectId, { lock: true });
    if (!project) throw new Error(`paiement ${row.id} : projet introuvable`);
    const currency = row.currency as Currency;
    const own = await allocationsOf(associationId, row.id, 'proposed', currency);
    const stored = await lockInstallments(associationId, row.enrollmentId, currency);

    const changed = moveAllocations(stored, { releasePending: own });
    await voidAllocations(associationId, row.id, 'proposed');
    await writeBalances(associationId, changed, await associationToday(associationId), project.graceDays);
    const rejected = await updateWithVersion(
      currentTx(),
      t,
      { id: row.id, version },
      {
        status: 'rejected',
        reviewedBy: actor.userId,
        reviewedAt: sql`now()`,
        rejectionReasonCode: input.reasonCode,
        rejectionMessage: input.message ?? null,
      },
    );
    if (!rejected) throw new DomainProblem('not_found');

    await this.outbox.publish(currentTx(), {
      type: 'payment.rejected',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'payment', id: row.id },
      payload: { paymentId: row.id, userId: row.userId, reasonCode: input.reasonCode },
    });
    recordAudit({
      entityType: 'payment',
      entityId: row.id,
      associationId,
      before: { status: row.status, version: row.version, allocations: own },
      after: { status: rejected.status, version: rejected.version, reasonCode: input.reasonCode },
    });
    await checkDeferred();
    return this.getPayment.execute(aid, row.id);
  }
}
