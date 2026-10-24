import { Controller, Get, Param } from '@nestjs/common';
import { AssociationParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetAssociationSubscriptionUseCase } from '../application/get-association-subscription.use-case.js';

/** bl.sub : abonnement de l'association, lecture par ses gestionnaires (association lue dans l'URL, MembershipGuard). */
@Controller('associations/:aid/subscription')
export class AssociationSubscriptionController {
  constructor(private readonly getSubscription: GetAssociationSubscriptionUseCase) {}

  @Get()
  @Endpoint('bl.sub', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    return this.getSubscription.execute(parseInput(AssociationParams, params).aid);
  }
}
