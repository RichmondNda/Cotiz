import { Injectable } from '@nestjs/common';
import type { ENDPOINTS, Handoff } from '@cotiz/contracts';
import type { z } from 'zod';
import { inviteToTeam, lockTeam, teamMembershipOf } from '../../access/access.public.js';
import { QuotaService } from '../../billing/billing.public.js';
import { TeamAccounts } from '../../identity/identity.public.js';
import { contextAssociationId } from '../../members/members.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { teamMemberView, type TeamMemberView } from './team-views.js';

type InviteBody = z.infer<(typeof ENDPOINTS)['tm.team']['operations']['invite']['request']['body']>;

/**
 * tm.team › invite (lot 4.5) : invitation d'un gestionnaire par code `team_invite` affiché avec message prêt (aucun
 * email envoyé, ui-deviations). Sous le verrou de l'équipe et de l'adresse :
 * - rôle `manager` ou `viewer` (un owner se nomme par tm.team › patch) ;
 * - adresse sans compte : compte en attente créé ; compte actif : il acceptera avec son mot de passe actuel ;
 *   compte inutilisable (verrouillé, désactivé, anonymisé) : `validation_failed` (email) ;
 * - déjà gestionnaire active de l'association : `validation_failed` (email, `already_member`) ;
 * - encore invitée : réinvitation (nouveau code, l'ancien invalidé, rôle mis à jour), sans place de plus ;
 * - sinon une place de plus (`quota_exceeded`, quota `managers`).
 * `team.changed` (`invited`), audité (`team.invite`).
 */
@Injectable()
export class InviteTeamMemberUseCase {
  constructor(
    private readonly accounts: TeamAccounts,
    private readonly quota: QuotaService,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('team.invite')
  async execute(aid: string, body: InviteBody): Promise<{ member: TeamMemberView; handoff: Handoff }> {
    const associationId = contextAssociationId(aid);
    const { userId: actorId } = requireActor();
    if (body.role === 'owner') throw new DomainProblem('validation_failed', { fields: { role: 'owner_by_patch' } });
    const email = body.email.toLowerCase();
    await lockTeam(associationId);
    await this.accounts.lockEmail(email);

    const account = await this.accounts.findByEmail(email);
    if (account && account.status !== 'active' && account.status !== 'pending_activation') {
      throw new DomainProblem('validation_failed', { fields: { email: 'account_unavailable' } });
    }
    const before = account ? await teamMembershipOf(associationId, account.userId) : null;
    if (before?.status === 'active') {
      throw new DomainProblem('validation_failed', { fields: { email: 'already_member' } });
    }
    if (before?.status !== 'invited') await this.quota.assert(associationId, 'managers');
    const userId =
      account?.userId ??
      (await this.accounts.create({ firstName: body.firstName, lastName: body.lastName, email, phone: body.phone }));
    await inviteToTeam(associationId, userId, body.role, actorId);

    const association = await ownAssociationOf(associationId);
    if (!association) throw new DomainProblem('not_found');
    const handoff = await this.accounts.issueInvite({
      userId,
      associationId,
      associationName: association.name,
      issuedBy: actorId,
      existingAccount: account?.status === 'active',
      personalMessage: body.message,
    });
    const contact = (await this.accounts.contactsOf([userId])).get(userId);
    if (!contact) throw new Error('tm.team › invite : compte introuvable');
    const member = teamMemberView(
      { userId, role: body.role, title: before?.title ?? null, status: 'invited' },
      contact,
    );

    await this.outbox.publish(currentTx(), {
      type: 'team.changed',
      associationId,
      actorUserId: actorId,
      aggregate: { type: 'membership', id: userId },
      payload: { associationId, userId, change: 'invited' },
    });
    recordAudit({
      entityType: 'membership',
      entityId: userId,
      before: before ? { role: before.role, status: before.status } : null,
      after: { role: body.role, status: 'invited' },
    });
    return { member, handoff };
  }
}
