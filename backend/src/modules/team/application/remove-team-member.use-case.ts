import { Injectable } from '@nestjs/common';
import { activeOwnersCountOf, lockTeam, removeFromTeam, teamMembershipOf } from '../../access/access.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';

/**
 * tm.team › remove (lot 4.5) : retrait d'un gestionnaire invité ou actif (sinon 404). Retirer le dernier owner actif
 * (soi-même compris) : `last_owner`, sous le verrou de l'équipe. L'association lui est refusée dès la requête suivante
 * (MembershipGuard) ; `team.changed` (`removed`) fait révoquer ses sessions (identity). Code d'invitation encore en
 * cours : il ne vaut plus rien (l'acceptation exige une appartenance invitée). Audité (`team.remove`).
 */
@Injectable()
export class RemoveTeamMemberUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('team.remove')
  async execute(aid: string, uid: string): Promise<void> {
    const associationId = contextAssociationId(aid);
    const userId = uid.toLowerCase();
    const { userId: actorId } = requireActor();
    await lockTeam(associationId);
    const before = await teamMembershipOf(associationId, userId);
    if (!before || before.status === 'removed') throw new DomainProblem('not_found');
    if (before.role === 'owner' && before.status === 'active' && (await activeOwnersCountOf(associationId)) <= 1) {
      throw new DomainProblem('last_owner');
    }
    if (!(await removeFromTeam(associationId, userId))) throw new DomainProblem('not_found');
    await this.outbox.publish(currentTx(), {
      type: 'team.changed',
      associationId,
      actorUserId: actorId,
      aggregate: { type: 'membership', id: userId },
      payload: { associationId, userId, change: 'removed' },
    });
    recordAudit({
      entityType: 'membership',
      entityId: userId,
      before: { role: before.role, status: before.status },
      after: { role: before.role, status: 'removed' },
    });
  }
}
