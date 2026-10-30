import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssociationParams,
  ListQuery,
  LookupInput,
  MemberParams,
  MembersQuery,
  PatchMemberInput,
} from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetMemberUseCase } from '../application/get-member.use-case.js';
import { ListMembersUseCase } from '../application/list-members.use-case.js';
import { LookupMemberUseCase } from '../application/lookup-member.use-case.js';
import { MemberTimelineUseCase } from '../application/member-timeline.use-case.js';
import { RegenerateActivationCodeUseCase } from '../application/regenerate-activation-code.use-case.js';
import { UpdateMemberUseCase } from '../application/update-member.use-case.js';

/** Souscripteurs d'une association (mb.*) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/members')
export class MembersController {
  constructor(
    private readonly lookupMember: LookupMemberUseCase,
    private readonly regenerateCode: RegenerateActivationCodeUseCase,
    private readonly listMembers: ListMembersUseCase,
    private readonly getMember: GetMemberUseCase,
    private readonly updateMember: UpdateMemberUseCase,
    private readonly memberTimeline: MemberTimelineUseCase,
  ) {}

  @Get()
  @Endpoint('mb.list', 'list')
  @Can('association.read')
  list(@Param() params: unknown, @Query() query: unknown) {
    return this.listMembers.execute(parseInput(AssociationParams, params).aid, parseInput(MembersQuery, query));
  }

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

  @Get(':uid')
  @Endpoint('mb.get', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    const { aid, uid } = parseInput(MemberParams, params);
    return this.getMember.execute(aid, uid);
  }

  @Patch(':uid')
  @Endpoint('mb.patch', 'patch')
  @Can('members.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    const { aid, uid } = parseInput(MemberParams, params);
    return this.updateMember.execute(aid, uid, parseInput(PatchMemberInput, body));
  }

  @Get(':uid/timeline')
  @Endpoint('mb.timeline', 'list')
  @Can('association.read')
  timeline(@Param() params: unknown, @Query() query: unknown) {
    const { aid, uid } = parseInput(MemberParams, params);
    return this.memberTimeline.execute(aid, uid, parseInput(ListQuery, query));
  }
}
