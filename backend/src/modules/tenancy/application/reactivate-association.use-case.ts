import { Injectable } from '@nestjs/common';
import type { PlatformAssociationDetail } from '@cotiz/contracts';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { changeAssociationStatus } from './association-status-change.js';
import { platformAssociationDetail } from './association-views.js';

/**
 * pf.asso.suspend (reactivate) : suspendue → active, date et motif de suspension effacés. Les gestionnaires
 * retrouvent l'espace de l'association dès la requête suivante (en se reconnectant si leurs sessions ont été révoquées).
 */
@Injectable()
export class ReactivateAssociationUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('association.reactivate')
  async execute(id: string): Promise<PlatformAssociationDetail> {
    const actor = requireActor();
    const { before, after } = await changeAssociationStatus(id, 'reactivate', () => undefined);
    await this.outbox.publish(currentTx(), {
      type: 'association.reactivated',
      associationId: id,
      actorUserId: actor.userId,
      aggregate: { type: 'association', id },
      payload: { associationId: id },
    });
    recordAudit({
      entityType: 'association',
      entityId: id,
      associationId: id,
      before: { status: before.status, suspensionReason: before.suspensionReason },
      after: { status: after.status },
    });
    return platformAssociationDetail(id);
  }
}
