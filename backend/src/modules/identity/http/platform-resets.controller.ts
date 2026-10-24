import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { IdParams, ResetRequestsQuery } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { IssuePlatformResetCodeUseCase } from '../application/issue-platform-reset-code.use-case.js';
import { ListPlatformResetRequestsUseCase } from '../application/list-platform-reset-requests.use-case.js';

/** pf.resets : demandes « mot de passe oublié » des gestionnaires, traitées par le super-admin (owner, admin). */
@Controller('platform/password-reset-requests')
export class PlatformResetsController {
  constructor(
    private readonly listRequests: ListPlatformResetRequestsUseCase,
    private readonly issueCode: IssuePlatformResetCodeUseCase,
  ) {}

  @Get()
  @Endpoint('pf.resets', 'list')
  @Can('platform.associations.manage')
  list(@Query() query: unknown) {
    return this.listRequests.execute(parseInput(ResetRequestsQuery, query));
  }

  @Post(':id/issue-code')
  @HttpCode(200)
  @Endpoint('pf.resets', 'issueCode')
  @Can('platform.associations.manage')
  issue(@Param() params: unknown) {
    return this.issueCode.execute(parseInput(IdParams, params).id);
  }
}
