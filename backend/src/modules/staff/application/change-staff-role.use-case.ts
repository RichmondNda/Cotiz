import { Injectable } from '@nestjs/common';
import {
  changePlatformRole,
  lockPlatformStaff,
  type PlatformRole,
  platformStaffList,
} from '../../access/access.public.js';
import { StaffAccounts } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { activeOwners, staffMemberView, type StaffMemberView } from './staff-views.js';

/**
 * pf.staff › patch (lot 4.7) : nouveau rôle d'une personne du personnel (sinon 404). Rétrograder le dernier owner actif
 * (soi-même compris) : `last_owner`, sous le verrou du personnel. `staff.changed` (`role_changed`), audité
 * (`staff.change_role`). Les droits suivent dès la requête suivante (rôle relu par les gardes).
 */
@Injectable()
export class ChangeStaffRoleUseCase {
  constructor(
    private readonly accounts: StaffAccounts,
    private readonly outbox: OutboxService,
  ) {}

  @Audited('staff.change_role')
  async execute(uid: string, role: PlatformRole): Promise<StaffMemberView> {
    const userId = uid.toLowerCase();
    const { userId: actorId } = requireActor();
    await lockPlatformStaff();
    const rows = await platformStaffList();
    const before = rows.find((r) => r.userId === userId);
    if (!before) throw new DomainProblem('not_found');
    const contacts = await this.accounts.contactsOf(rows.map((r) => r.userId));
    const contact = contacts.get(userId);
    if (!contact) throw new DomainProblem('not_found');
    if (
      before.role === 'owner' &&
      role !== 'owner' &&
      contact.status === 'active' &&
      activeOwners(rows, contacts) <= 1
    ) {
      throw new DomainProblem('last_owner');
    }
    if (!(await changePlatformRole(userId, role))) throw new DomainProblem('not_found');
    if (before.role !== role) {
      await this.outbox.publish(currentTx(), {
        type: 'staff.changed',
        associationId: null,
        actorUserId: actorId,
        aggregate: { type: 'platform_staff', id: userId },
        payload: { userId, change: 'role_changed' },
      });
    }
    recordAudit({
      entityType: 'platform_staff',
      entityId: userId,
      associationId: null,
      before: { role: before.role },
      after: { role },
    });
    return staffMemberView({ userId, role }, contact);
  }
}
