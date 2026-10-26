import { Body, Controller, Header, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationParams, LookupInput, MemberParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { LookupMemberUseCase } from '../application/lookup-member.use-case.js';
import { RegenerateActivationCodeUseCase } from '../application/regenerate-activation-code.use-case.js';

/** Souscripteurs d'une association (mb.*) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/members')
export class MembersController {
  constructor(
    private readonly lookupMember: LookupMemberUseCase,
    private readonly regenerateCode: RegenerateActivationCodeUseCase,
  ) {}

  @Post('lookup')
  @Endpoint('mb.lookup', 'lookup')
  @Can('members.manage')
  @HttpCode(200)
  lookup(@Param() params: unknown, @Body() body: unknown) {
    return this.lookupMember.execute(parseInput(AssociationParams, params).aid, parseInput(LookupInput, body));
  }

  @Post(':uid/activation-code')
  @Endpoint('mb.resend', 'regenerate')
  @Can('members.manage')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  regenerate(@Param() params: unknown) {
    const { aid, uid } = parseInput(MemberParams, params);
    return this.regenerateCode.execute(aid, uid);
  }
}
