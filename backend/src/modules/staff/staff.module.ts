import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { ChangeStaffRoleUseCase } from './application/change-staff-role.use-case.js';
import { InviteStaffMemberUseCase } from './application/invite-staff-member.use-case.js';
import { ListStaffUseCase } from './application/list-staff.use-case.js';
import { RemoveStaffMemberUseCase } from './application/remove-staff-member.use-case.js';
import { StaffController } from './http/staff.controller.js';

/**
 * Module staff (pf.staff, lot 4.7) : personnel de la plateforme. Sans table : rôles par access.public, comptes et
 * codes d'invitation par identity.public (comme le module team). Révocation des sessions d'un retiré : consommateur de
 * staff.changed (identity).
 */
@Module({
  imports: [IdentityModule],
  controllers: [StaffController],
  providers: [ListStaffUseCase, InviteStaffMemberUseCase, ChangeStaffRoleUseCase, RemoveStaffMemberUseCase],
})
export class StaffModule {}
