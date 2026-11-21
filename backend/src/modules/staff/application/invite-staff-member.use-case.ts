import { Injectable } from '@nestjs/common';
import type { ENDPOINTS, Handoff } from '@cotiz/contracts';
import type { z } from 'zod';
import {
  changePlatformRole,
  grantPlatformRole,
  lockPlatformStaff,
  platformRoleOf,
} from '../../access/access.public.js';
import { StaffAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { staffMemberView, type StaffMemberView } from './staff-views.js';

type InviteBody = z.infer<(typeof ENDPOINTS)['pf.staff']['operations']['invite']['request']['body']>;

/**
 * pf.staff › invite (lot 4.7) : invitation au personnel par code `staff_invite` affiché avec message prêt (aucun email,
 * ui-deviations). Sous le verrou du personnel et de l'adresse :
 * - adresse sans compte : compte en attente créé, rôle accordé (la personne n'entre qu'après activation et second
 *   facteur) ;
 * - personne du personnel encore invitée, ou invitée puis retirée avant l'activation : réinvitation (nouveau code,
 *   l'ancien invalidé ; rôle et nom mis à jour) ;
 * - tout autre compte (actif, gestionnaire, souscripteur, personnel actif…) : `validation_failed` (email,
 *   `account_exists`). Jamais de rôle plateforme ajouté à un compte existant : ses accès ne changent pas sans lui.
 * `staff.changed` (`invited`), audité (`staff.invite`).
 */
@Injectable()
export class InviteStaffMemberUseCase {
  constructor(
    private readonly accounts: StaffAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('staff.invite')
  async execute(body: InviteBody): Promise<{ member: StaffMemberView; handoff: Handoff }> {
    const { userId: actorId } = requireActor();
    const email = body.email.toLowerCase();
    await lockPlatformStaff();
    await this.accounts.lockEmail(email);

    const account = await this.accounts.findByEmail(email);
    const previousRole = account ? await platformRoleOf(account.userId) : null;
    // Compte en attente : réinvitable s'il est encore du personnel, ou s'il a été créé pour lui puis retiré avant
    // l'activation (dernier code émis : une invitation au personnel).
    const reinvitable =
      account?.status === 'pending_activation' &&
      (previousRole !== null || (await this.accounts.createdForStaff(account.userId)));
    if (account && !reinvitable) {
      throw new DomainProblem('validation_failed', { fields: { email: 'account_exists' } });
    }
    let userId: string;
    if (account) {
      userId = account.userId;
      await this.accounts.rename(userId, { firstName: body.firstName, lastName: body.lastName });
      if (previousRole === null) await grantPlatformRole(userId, body.role);
      else await changePlatformRole(userId, body.role);
    } else {
      userId = await this.accounts.create({ firstName: body.firstName, lastName: body.lastName, email });
      await grantPlatformRole(userId, body.role);
    }
    const handoff = await this.accounts.issueInvite({ userId, issuedBy: actorId });
    const contact = (await this.accounts.contactsOf([userId])).get(userId);
    if (!contact) throw new Error('pf.staff › invite : compte introuvable');

    await this.outbox.publish(currentTx(), {
      type: 'staff.changed',
      associationId: null,
      actorUserId: actorId,
      aggregate: { type: 'platform_staff', id: userId },
      payload: { userId, change: 'invited' },
    });
    recordAudit({
      entityType: 'platform_staff',
      entityId: userId,
      associationId: null,
      before: previousRole ? { role: previousRole, status: 'invited' } : null,
      after: { role: body.role, status: 'invited' },
    });
    return { member: staffMemberView({ userId, role: body.role }, contact), handoff };
  }
}
