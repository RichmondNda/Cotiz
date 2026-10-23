import { Injectable } from '@nestjs/common';
import type { PlatformAssociationDetail, SuspendAssociationInput } from '@cotiz/contracts';
import type { z } from 'zod';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { changeAssociationStatus } from './association-status-change.js';
import { platformAssociationDetail } from './association-views.js';

/**
 * pf.asso.suspend (suspend) : confirmation renforcée par la saisie du nom (sinon 422 `confirmName: mismatch`), active
 * ou en retard → suspendue avec son motif. Effet immédiat : MembershipGuard refuse l'espace de l'association dès la
 * requête suivante ; association.suspended fait révoquer les sessions de ses gestionnaires (identity, worker).
 */
@Injectable()
export class SuspendAssociationUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association.suspend')
  async execute(id: string, input: z.infer<typeof SuspendAssociationInput>): Promise<PlatformAssociationDetail> {
    const actor = requireActor();
    const reason = input.reason.trim();
    if (reason === '') throw new DomainProblem('validation_failed', { fields: { reason: 'required' } });
    const { before, after } = await changeAssociationStatus(
      id,
      'suspend',
      (current) => {
        if (input.confirmName.trim() !== current.name.trim()) {
          throw new DomainProblem('validation_failed', { fields: { confirmName: 'mismatch' } });
        }
      },
      reason,
    );
    await this.outbox.publish(currentTx(), {
      type: 'association.suspended',
      associationId: id,
      actorUserId: actor.userId,
      aggregate: { type: 'association', id },
      payload: { associationId: id, reason },
    });
    recordAudit({
      entityType: 'association',
      entityId: id,
      associationId: id,
      before: { status: before.status },
      after: { status: after.status, suspensionReason: reason },
    });
    return platformAssociationDetail(id);
  }
}
