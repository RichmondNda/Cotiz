import { Module } from '@nestjs/common';
import { CreateChallengeUseCase } from './application/create-challenge.use-case.js';
import { SubmitRequestUseCase } from './application/submit-request.use-case.js';
import { PublicRequestsController } from './http/public-requests.controller.js';
import { SubmitThrottleInterceptor } from './http/submit-throttle.interceptor.js';
import { AltchaReplayGuard } from './infra/altcha-replay-guard.js';
import { AltchaService } from './infra/altcha.service.js';

/** Module onboarding (lot 1.3) : demandes de création (pub.challenge, pub.request), approbation, création directe. */
@Module({
  controllers: [PublicRequestsController],
  providers: [
    AltchaService,
    AltchaReplayGuard,
    SubmitThrottleInterceptor,
    CreateChallengeUseCase,
    SubmitRequestUseCase,
  ],
})
export class OnboardingModule {}
