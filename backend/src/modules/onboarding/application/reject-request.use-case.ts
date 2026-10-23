import { Injectable } from '@nestjs/common';
import type { AssociationRequestDetail } from '@cotiz/contracts';
import { associationRequests as t } from '@cotiz/db';
import { eq, sql } from 'drizzle-orm';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { referencesOf, toDetail } from './request-views.js';

export interface RejectInput {
  reasonCode: string;
  message?: string | undefined;
}

/**
 * pf.req.reject : refus motivé (code et message), sous verrou de la demande. Une demande déjà traitée (approuvée ou
 * refusée) : `request_already_handled`. Aucun email : le message est remis par la plateforme elle-même (message prêt
 * à l'écran). Événement `association.request_rejected`, audit.
 */
@Injectable()
export class RejectRequestUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association_request.reject')
  async execute(id: string, input: RejectInput): Promise<AssociationRequestDetail> {
    const actor = requireActor();
    const tx = currentTx();
    const [request] = await tx.select({ status: t.status }).from(t).where(eq(t.id, id)).for('update');
    if (!request) throw new DomainProblem('not_found');
    if (request.status !== 'pending') throw new DomainProblem('request_already_handled');

    const [row] = await tx
      .update(t)
      .set({
        status: 'rejected',
        decidedBy: actor.userId,
        decidedAt: sql`now()`,
        rejectionReasonCode: input.reasonCode,
        rejectionMessage: input.message?.trim() ? input.message.trim() : null,
      })
      .where(eq(t.id, id))
      .returning();
    if (!row) throw new Error('pf.req.reject : demande disparue sous verrou');
    await this.outbox.publish(tx, {
      type: 'association.request_rejected',
      associationId: null,
      actorUserId: actor.userId,
      aggregate: { type: 'association_request', id },
      payload: { requestId: id, reasonCode: input.reasonCode },
    });
    recordAudit({
      entityType: 'association_request',
      entityId: id,
      associationId: null,
      before: { status: 'pending' },
      after: { status: 'rejected', rejectionReasonCode: input.reasonCode },
    });
    return toDetail(row, await referencesOf([row]));
  }

  /** Rejeu de la même requête (même Idempotency-Key) : la fiche relue en base, sans rien réécrire ni auditer. */
  async replay(id: string): Promise<AssociationRequestDetail> {
    const [row] = await currentTx().select().from(t).where(eq(t.id, id));
    if (!row) throw new DomainProblem('not_found');
    if (row.status !== 'rejected') throw new DomainProblem('request_already_handled');
    return toDetail(row, await referencesOf([row]));
  }
}
