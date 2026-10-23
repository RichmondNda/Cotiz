import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import { ApproveRequestInput, AssociationRequestsQuery, IdParams, RejectRequestInput } from '@cotiz/contracts';
import { Can, Endpoint, idempotentReplay, parseInput, ReplayInHandler } from '../../../shared/http/index.js';
import { ApproveRequestUseCase } from '../application/approve-request.use-case.js';
import { GetRequestUseCase } from '../application/get-request.use-case.js';
import { ListRequestsUseCase } from '../application/list-requests.use-case.js';
import { RejectRequestUseCase } from '../application/reject-request.use-case.js';

/**
 * pf.req.list, pf.req.get : file des demandes de création (connexion plateforme, lecture : support compris) ;
 * pf.req.approve, pf.req.reject : décision (owner et admin plateforme).
 */
@Controller('platform/association-requests')
export class PlatformRequestsController {
  constructor(
    private readonly listRequests: ListRequestsUseCase,
    private readonly getRequest: GetRequestUseCase,
    private readonly approveRequest: ApproveRequestUseCase,
    private readonly rejectRequest: RejectRequestUseCase,
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

  // Réponse avec le code d'activation : rien n'est mémorisé pour l'idempotence, le rejeu la reconstruit.
  @Post(':id/approve')
  @HttpCode(200)
  @Endpoint('pf.req.approve', 'approve')
  @Can('platform.requests.manage')
  @ReplayInHandler()
  approve(@Param() params: unknown, @Body() body: unknown, @Req() request: object) {
    const { id } = parseInput(IdParams, params);
    const input = parseInput(ApproveRequestInput, body);
    return idempotentReplay(request) ? this.approveRequest.replay(id, input) : this.approveRequest.execute(id, input);
  }

  // Fiche du demandeur (nom, email, téléphone) : rien n'est mémorisé, le rejeu la relit en base.
  @Post(':id/reject')
  @HttpCode(200)
  @Endpoint('pf.req.reject', 'reject')
  @Can('platform.requests.manage')
  @ReplayInHandler()
  reject(@Param() params: unknown, @Body() body: unknown, @Req() request: object) {
    const { id } = parseInput(IdParams, params);
    const input = parseInput(RejectRequestInput, body);
    return idempotentReplay(request) ? this.rejectRequest.replay(id) : this.rejectRequest.execute(id, input);
  }
}
