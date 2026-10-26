import { Injectable } from '@nestjs/common';
import type { Handoff } from '@cotiz/contracts';
import { platformRoleOf, subscriberMembershipOf } from '../../access/access.public.js';
import { SubscriberAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { profileCreatorOf } from './enrollment-records.js';
import { contextAssociationId } from './member-context.js';

/**
 * mb.resend : nouveau code d'activation et message prêt pour un souscripteur non activé de l'association ; l'ancien code
 * est invalidé (CodeService). Comme en.create (B1), seulement pour un compte créé par cette association : un code émis
 * ici fixerait le mot de passe d'un compte qui sert aussi ailleurs. Refus :
 * - pas souscripteur de l'association (jamais, ou retiré) : 404, comme un identifiant inconnu ;
 * - compte actif : `already_activated` ;
 * - créé ailleurs, désactivé, anonymisé, verrouillé, personnel de la plateforme : `invalid_state`.
 * Verrous dans l'ordre de auth.activate (codes puis compte) : une activation simultanée aboutit d'abord, et le statut
 * relu ensuite dit `already_activated`.
 */
@Injectable()
export class RegenerateActivationCodeUseCase {
  constructor(
    private readonly accounts: SubscriberAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('activation_code.issue')
  async execute(aid: string, userId: string): Promise<Handoff> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const membership = await subscriberMembershipOf(associationId, userId);
    if (membership === null || membership === 'removed') throw new DomainProblem('not_found');

    await this.accounts.lockActivation(userId);
    const member = await this.accounts.contactOf(userId, { lock: 'share' });
    if (!member) throw new DomainProblem('not_found');
    if (member.status === 'active') throw new DomainProblem('already_activated');
    if (
      member.status !== 'pending_activation' ||
      (await profileCreatorOf(userId)) !== associationId ||
      (await platformRoleOf(userId)) !== null
    ) {
      throw new DomainProblem('invalid_state');
    }

    const { codeId, handoff } = await this.accounts.issueActivation(userId, associationId, actor.userId);
    await this.outbox.publish(currentTx(), {
      type: 'activation.code_issued',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'user', id: userId },
      payload: { userId, associationId, codeId },
    });
    // Jamais de clé « code » : l'audit la masquerait.
    recordAudit({ entityType: 'user', entityId: userId, after: { activationCodeId: codeId } });
    return handoff;
  }
}
