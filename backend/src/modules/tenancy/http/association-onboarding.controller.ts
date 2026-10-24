import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CompleteOnboardingUseCase } from '../application/complete-onboarding.use-case.js';

/** as.onb : clôture de l'onboarding de l'association par son owner (association lue dans l'URL, MembershipGuard). */
@Controller('associations/:aid/onboarding')
export class AssociationOnboardingController {
  constructor(private readonly completeOnboarding: CompleteOnboardingUseCase) {}

  @Post('complete')
  @HttpCode(200)
  @Endpoint('as.onb', 'complete')
  @Can('association.settings.manage')
  complete(@Param() params: unknown) {
    return this.completeOnboarding.execute(parseInput(AssociationParams, params).aid);
  }
}
