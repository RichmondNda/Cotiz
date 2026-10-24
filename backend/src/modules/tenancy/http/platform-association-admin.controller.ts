import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { IdParams, PatchAssociationInput, PlatformAssociationsQuery, SuspendAssociationInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetAssociationUseCase } from '../application/get-association.use-case.js';
import { ListAssociationsUseCase } from '../application/list-associations.use-case.js';
import { ReactivateAssociationUseCase } from '../application/reactivate-association.use-case.js';
import { SuspendAssociationUseCase } from '../application/suspend-association.use-case.js';
import { UpdateAssociationUseCase } from '../application/update-association.use-case.js';

/**
 * pf.asso.list, pf.asso.get : associations de la plateforme (connexion plateforme, lecture : support compris, sans
 * audit) ; pf.asso.patch : modification administrative (owner et admin plateforme, If-Match) ; pf.asso.suspend :
 * suspension et réactivation. La création directe
 * (pf.asso.create) est au module onboarding.
 */
@Controller('platform/associations')
export class PlatformAssociationAdminController {
  constructor(
    private readonly listAssociations: ListAssociationsUseCase,
    private readonly getAssociation: GetAssociationUseCase,
    private readonly updateAssociation: UpdateAssociationUseCase,
    private readonly suspendAssociation: SuspendAssociationUseCase,
    private readonly reactivateAssociation: ReactivateAssociationUseCase,
  ) {}

  @Get()
  @Endpoint('pf.asso.list', 'list')
  @Can('platform.associations.read')
  list(@Query() query: unknown) {
    return this.listAssociations.execute(parseInput(PlatformAssociationsQuery, query));
  }

  @Get(':id')
  @Endpoint('pf.asso.get', 'get')
  @Can('platform.associations.read')
  get(@Param() params: unknown) {
    return this.getAssociation.execute(parseInput(IdParams, params).id);
  }

  @Patch(':id')
  @Endpoint('pf.asso.patch', 'patch')
  @Can('platform.associations.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    return this.updateAssociation.execute(parseInput(IdParams, params).id, parseInput(PatchAssociationInput, body));
  }

  @Post(':id/suspend')
  @HttpCode(200)
  @Endpoint('pf.asso.suspend', 'suspend')
  @Can('platform.associations.manage')
  suspend(@Param() params: unknown, @Body() body: unknown) {
    return this.suspendAssociation.execute(parseInput(IdParams, params).id, parseInput(SuspendAssociationInput, body));
  }

  @Post(':id/reactivate')
  @HttpCode(200)
  @Endpoint('pf.asso.suspend', 'reactivate')
  @Can('platform.associations.manage')
  reactivate(@Param() params: unknown) {
    return this.reactivateAssociation.execute(parseInput(IdParams, params).id);
  }
}
