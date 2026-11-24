import { Injectable } from '@nestjs/common';
import { lockPlatformStaff, platformStaffList, revokePlatformRole } from '../../access/access.public.js';
import { StaffAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { activeOwners } from './staff-views.js';

/**
 * pf.staff › remove (lot 4.7) : retrait d'une personne du personnel, invitée ou active (sinon 404). Retirer le dernier
 * owner actif (soi-même compris) : `last_owner`, sous le verrou du personnel. La plateforme lui est refusée dès la
 * requête suivante (plus de rôle) ; `staff.changed` (`removed`) fait révoquer ses sessions plateforme (identity). Code
 * d'invitation encore en cours : il ne vaut plus rien (l'activation exige le rôle). Son compte et ses autres espaces
 * restent. Audité (`staff.remove`).
 */
@Injectable()
export class RemoveStaffMemberUseCase {
  constructor(
    private readonly accounts: StaffAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('staff.remove')
  async execute(uid: string): Promise<void> {
    const userId = uid.toLowerCase();
    const { userId: actorId } = requireActor();
    await lockPlatformStaff();
    const rows = await platformStaffList();
    const before = rows.find((r) => r.userId === userId);
    if (!before) throw new DomainProblem('not_found');
    const contacts = await this.accounts.contactsOf(rows.map((r) => r.userId));
    const account = contacts.get(userId)?.status;
    const status = account === 'pending_activation' ? 'invited' : 'active';
    if (before.role === 'owner' && account === 'active' && activeOwners(rows, contacts) <= 1) {
      throw new DomainProblem('last_owner');
    }
    if (!(await revokePlatformRole(userId))) throw new DomainProblem('not_found');
    await this.outbox.publish(currentTx(), {
      type: 'staff.changed',
      associationId: null,
      actorUserId: actorId,
      aggregate: { type: 'platform_staff', id: userId },
      payload: { userId, change: 'removed' },
    });
    recordAudit({
      entityType: 'platform_staff',
      entityId: userId,
      associationId: null,
      before: { role: before.role, status },
      after: null,
    });
  }
}
