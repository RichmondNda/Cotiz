import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ENDPOINTS, UserParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ChangeStaffRoleUseCase } from '../application/change-staff-role.use-case.js';
import { InviteStaffMemberUseCase } from '../application/invite-staff-member.use-case.js';
import { ListStaffUseCase } from '../application/list-staff.use-case.js';
import { RemoveStaffMemberUseCase } from '../application/remove-staff-member.use-case.js';

const STAFF = ENDPOINTS['pf.staff'].operations;

/** Personnel de la plateforme (pf.staff, lot 4.7), `platform.staff.manage` (owner). */
@Controller('platform/staff')
export class StaffController {
  constructor(
    private readonly listStaff: ListStaffUseCase,
    private readonly inviteMember: InviteStaffMemberUseCase,
    private readonly changeRole: ChangeStaffRoleUseCase,
    private readonly removeMember: RemoveStaffMemberUseCase,
  ) {}

  @Get()
  @Endpoint('pf.staff', 'list')
  @Can('platform.staff.manage')
  list() {
    return this.listStaff.execute();
  }

  @Post('invitations')
  @Endpoint('pf.staff', 'invite')
  @Can('platform.staff.manage')
  @HttpCode(201)
  invite(@Body() body: unknown) {
    return this.inviteMember.execute(parseInput(STAFF.invite.request.body, body));
  }

  @Patch(':uid')
  @Endpoint('pf.staff', 'patch')
  @Can('platform.staff.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    return this.changeRole.execute(parseInput(UserParams, params).uid, parseInput(STAFF.patch.request.body, body).role);
  }

  @Delete(':uid')
  @Endpoint('pf.staff', 'remove')
  @Can('platform.staff.manage')
  @HttpCode(204)
  async remove(@Param() params: unknown): Promise<void> {
    await this.removeMember.execute(parseInput(UserParams, params).uid);
  }
}
