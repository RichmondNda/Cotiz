import { Injectable } from '@nestjs/common';
import type { ActivationCodeEntry } from '@cotiz/contracts';
import type { z } from 'zod';
import { SubscriberActivationCodes } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { contextAssociationId } from './member-context.js';

/**
 * mb.codes (markHanded) : un gestionnaire a remis le code. Seulement un code de la liste (404 sinon : consommé, remplacé,
 * autre association). Date posée une fois : un second marquage renvoie la même entrée, sans nouvel événement.
 */
@Injectable()
export class MarkActivationCodeHandedUseCase {
  constructor(
    private readonly codes: SubscriberActivationCodes,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('activation_code.hand')
  async execute(aid: string, codeId: string): Promise<z.infer<typeof ActivationCodeEntry>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const marked = await this.codes.markHanded(codeId);
    if (!marked) throw new DomainProblem('not_found');
    if (marked.first) {
      await this.outbox.publish(currentTx(), {
        type: 'activation.code_handed',
        associationId,
        actorUserId: actor.userId,
        aggregate: { type: 'activation_code', id: codeId },
        payload: { codeId, handedBy: actor.userId },
      });
    }
    recordAudit({
      entityType: 'activation_code',
      entityId: codeId,
      after: { handedAt: marked.entry.handedAt, first: marked.first },
    });
    return marked.entry;
  }
}
