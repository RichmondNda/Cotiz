import { Injectable } from '@nestjs/common';
import type { ManagerRole } from '@cotiz/contracts';
import type { z } from 'zod';
import { activeOwnersCountOf, changeTeamRole, lockTeam, teamMembershipOf } from '../../access/access.public.js';
import { TeamAccounts } from '../../identity/identity.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { teamMemberView, type TeamMemberView } from './team-views.js';

/**
 * tm.team › patch (lot 4.5) : nouveau rôle d'un gestionnaire invité ou actif (sinon 404, comme une personne
 * inconnue). Rétrograder le dernier owner actif : `last_owner` (sous le verrou de l'équipe). `team.changed`
 * (`role_changed`), audité (`team.change_role`).
 */
@Injectable()
export class ChangeTeamRoleUseCase {
  constructor(
    private readonly accounts: TeamAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('team.change_role')
  async execute(aid: string, uid: string, role: z.infer<typeof ManagerRole>): Promise<TeamMemberView> {
    const associationId = contextAssociationId(aid);
    const userId = uid.toLowerCase();
    const { userId: actorId } = requireActor();
    await lockTeam(associationId);
    const before = await teamMembershipOf(associationId, userId);
    if (!before || before.status === 'removed') throw new DomainProblem('not_found');
    if (before.role === 'owner' && role !== 'owner' && before.status === 'active') {
      if ((await activeOwnersCountOf(associationId)) <= 1) throw new DomainProblem('last_owner');
    }
    if (!(await changeTeamRole(associationId, userId, role))) throw new DomainProblem('not_found');
    const contact = (await this.accounts.contactsOf([userId])).get(userId);
    if (!contact) throw new DomainProblem('not_found');
    if (before.role !== role) {
      await this.outbox.publish(currentTx(), {
        type: 'team.changed',
        associationId,
        actorUserId: actorId,
        aggregate: { type: 'membership', id: userId },
        payload: { associationId, userId, change: 'role_changed' },
      });
    }
    recordAudit({ entityType: 'membership', entityId: userId, before: { role: before.role }, after: { role } });
    return teamMemberView({ userId, role, title: before.title, status: before.status }, contact);
  }
}
