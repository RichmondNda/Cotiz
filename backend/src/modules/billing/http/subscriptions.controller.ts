import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ChangePlanInput, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ChangePlanUseCase } from '../application/change-plan.use-case.js';

/** pf.asso.plan : changement de plan de l'abonnement d'une association (owner et admin plateforme). */
@Controller('platform/associations')
export class PlatformSubscriptionsController {
  constructor(private readonly changePlan: ChangePlanUseCase) {}

  @Post(':id/change-plan')
  @HttpCode(200)
  @Endpoint('pf.asso.plan', 'changePlan')
  @Can('platform.associations.manage')
  change(@Param() params: unknown, @Body() body: unknown) {
    return this.changePlan.execute(parseInput(IdParams, params).id, parseInput(ChangePlanInput, body));
  }
}
