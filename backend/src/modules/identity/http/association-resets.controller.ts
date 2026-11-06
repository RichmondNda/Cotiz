import { Controller, Get, Header, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, ResetRequestsQuery } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { IssueAssociationResetCodeUseCase } from '../application/issue-association-reset-code.use-case.js';
import { ListAssociationResetRequestsUseCase } from '../application/list-association-reset-requests.use-case.js';

/** as.resets : demandes « mot de passe oublié » des souscripteurs, traitées par l'association (mg-resets, lot 3.1). */
@Controller('associations/:aid/password-reset-requests')
export class AssociationResetsController {
  constructor(
    private readonly listRequests: ListAssociationResetRequestsUseCase,
    private readonly issueCode: IssueAssociationResetCodeUseCase,
  ) {}

  @Get()
  @Endpoint('as.resets', 'list')
  @Can('members.manage')
  list(@Param() params: unknown, @Query() query: unknown) {
    return this.listRequests.execute(parseInput(AssociationParams, params).aid, parseInput(ResetRequestsQuery, query));
  }

  /** Code affiché une seule fois : jamais mis en cache. */
  @Post(':id/issue-code')
  @HttpCode(200)
  @Endpoint('as.resets', 'issueCode')
  @Can('members.manage')
  @Header('Cache-Control', 'no-store')
  issue(@Param() params: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.issueCode.execute(aid, id);
  }
}
