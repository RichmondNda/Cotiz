import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { IdParams, PlanInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ArchivePlanUseCase } from '../application/archive-plan.use-case.js';
import { CreatePlanUseCase } from '../application/create-plan.use-case.js';
import { DuplicatePlanUseCase } from '../application/duplicate-plan.use-case.js';
import { ListPlansUseCase } from '../application/list-plans.use-case.js';
import { ListPublicPlansUseCase } from '../application/list-public-plans.use-case.js';
import { UpdatePlanUseCase } from '../application/update-plan.use-case.js';

/** pub.plans : plans publiés (landing, formulaire de demande), sans authentification. */
@Controller('public/plans')
export class PublicPlansController {
  constructor(private readonly listPublic: ListPublicPlansUseCase) {}

  @Get()
  @Endpoint('pub.plans', 'list')
  @Can('public')
  list() {
    return this.listPublic.execute();
  }
}

/** pf.plans, pf.plan.write, pf.plan.archive : offre commerciale gérée par le super-admin (connexion plateforme). */
@Controller('platform/plans')
export class PlatformPlansController {
  constructor(
    private readonly listPlans: ListPlansUseCase,
    private readonly createPlan: CreatePlanUseCase,
    private readonly updatePlan: UpdatePlanUseCase,
    private readonly archivePlan: ArchivePlanUseCase,
    private readonly duplicatePlan: DuplicatePlanUseCase,
  ) {}

  @Get()
  @Endpoint('pf.plans', 'list')
  @Can('platform.associations.read')
  list() {
    return this.listPlans.execute();
  }

  @Post()
  @Endpoint('pf.plan.write', 'create')
  @Can('platform.plans.manage')
  @HttpCode(201)
  create(@Body() body: unknown) {
    return this.createPlan.execute(parseInput(PlanInput, body));
  }

  @Patch(':id')
  @Endpoint('pf.plan.write', 'patch')
  @Can('platform.plans.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    return this.updatePlan.execute(parseInput(IdParams, params).id, parseInput(PlanInput.partial(), body));
  }

  @Post(':id/archive')
  @Endpoint('pf.plan.archive', 'archive')
  @Can('platform.plans.manage')
  @HttpCode(200)
  archive(@Param() params: unknown) {
    return this.archivePlan.execute(parseInput(IdParams, params).id);
  }

  @Post(':id/duplicate')
  @Endpoint('pf.plan.archive', 'duplicate')
  @Can('platform.plans.manage')
  @HttpCode(201)
  duplicate(@Param() params: unknown) {
    return this.duplicatePlan.execute(parseInput(IdParams, params).id);
  }
}
