import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationParams, LookupInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { LookupMemberUseCase } from '../application/lookup-member.use-case.js';

/** Souscripteurs d'une association (mb.*) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/members')
export class MembersController {
  constructor(private readonly lookupMember: LookupMemberUseCase) {}

  @Post('lookup')
  @Endpoint('mb.lookup', 'lookup')
  @Can('members.manage')
  @HttpCode(200)
  lookup(@Param() params: unknown, @Body() body: unknown) {
    return this.lookupMember.execute(parseInput(AssociationParams, params).aid, parseInput(LookupInput, body));
  }
}
