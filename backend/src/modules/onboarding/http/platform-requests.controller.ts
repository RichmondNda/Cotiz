import { Controller, Get, Param, Query } from '@nestjs/common';
import { AssociationRequestsQuery, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetRequestUseCase } from '../application/get-request.use-case.js';
import { ListRequestsUseCase } from '../application/list-requests.use-case.js';

/** pf.req.list, pf.req.get : file des demandes de création (connexion plateforme, lecture : support compris). */
@Controller('platform/association-requests')
export class PlatformRequestsController {
  constructor(
    private readonly listRequests: ListRequestsUseCase,
    private readonly getRequest: GetRequestUseCase,
  ) {}

  @Get()
  @Endpoint('pf.req.list', 'list')
  @Can('platform.associations.read')
  list(@Query() query: unknown) {
    return this.listRequests.execute(parseInput(AssociationRequestsQuery, query));
  }

  @Get(':id')
  @Endpoint('pf.req.get', 'get')
  @Can('platform.associations.read')
  get(@Param() params: unknown) {
    return this.getRequest.execute(parseInput(IdParams, params).id);
  }
}
