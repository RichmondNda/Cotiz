import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { IdentityModule } from '../identity/identity.public.js';
import { ChangeTeamRoleUseCase } from './application/change-team-role.use-case.js';
import { InviteTeamMemberUseCase } from './application/invite-team-member.use-case.js';
import { ListTeamUseCase } from './application/list-team.use-case.js';
import { RemoveTeamMemberUseCase } from './application/remove-team-member.use-case.js';
import { TeamController } from './http/team.controller.js';

/**
 * Module team (tm.team, lot 4.5) : équipe d'une association. Sans table : appartenances par access.public, comptes et
 * codes d'invitation par identity.public (le module access ne peut importer identity sans cycle entre leurs surfaces
 * publiques, qui casse l'injection Nest). Révocation des sessions d'un retiré : consommateur de team.changed (identity).
 */
@Module({
  imports: [IdentityModule],
  controllers: [TeamController],
  providers: [ListTeamUseCase, InviteTeamMemberUseCase, ChangeTeamRoleUseCase, RemoveTeamMemberUseCase, QuotaService],
})
export class TeamModule {}
