import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AssociationParams, ENDPOINTS, TeamParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ChangeTeamRoleUseCase } from '../application/change-team-role.use-case.js';
import { InviteTeamMemberUseCase } from '../application/invite-team-member.use-case.js';
import { ListTeamUseCase } from '../application/list-team.use-case.js';
import { RemoveTeamMemberUseCase } from '../application/remove-team-member.use-case.js';

const TEAM = ENDPOINTS['tm.team'].operations;

/** Équipe de l'association (tm.team, lot 4.5), `association.team.manage` (owner). */
@Controller('associations/:aid/team')
export class TeamController {
  constructor(
    private readonly listTeam: ListTeamUseCase,
    private readonly inviteMember: InviteTeamMemberUseCase,
    private readonly changeRole: ChangeTeamRoleUseCase,
    private readonly removeMember: RemoveTeamMemberUseCase,
  ) {}

  @Get()
  @Endpoint('tm.team', 'list')
  @Can('association.team.manage')
  list(@Param() params: unknown) {
    return this.listTeam.execute(parseInput(AssociationParams, params).aid);
  }

  @Post('invitations')
  @Endpoint('tm.team', 'invite')
  @Can('association.team.manage')
  @HttpCode(201)
  invite(@Param() params: unknown, @Body() body: unknown) {
    return this.inviteMember.execute(
      parseInput(AssociationParams, params).aid,
      parseInput(TEAM.invite.request.body, body),
    );
  }

  @Patch(':uid')
  @Endpoint('tm.team', 'patch')
  @Can('association.team.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    const { aid, uid } = parseInput(TeamParams, params);
    return this.changeRole.execute(aid, uid, parseInput(TEAM.patch.request.body, body).role);
  }

  @Delete(':uid')
  @Endpoint('tm.team', 'remove')
  @Can('association.team.manage')
  @HttpCode(204)
  async remove(@Param() params: unknown): Promise<void> {
    const { aid, uid } = parseInput(TeamParams, params);
    await this.removeMember.execute(aid, uid);
  }
}
