import { Module } from '@nestjs/common';
import { CreateChallengeUseCase } from './application/create-challenge.use-case.js';
import { GetLegalPageUseCase } from './application/get-legal-page.use-case.js';
import { GetRequestUseCase } from './application/get-request.use-case.js';
import { ListRequestsUseCase } from './application/list-requests.use-case.js';
import { SubmitRequestUseCase } from './application/submit-request.use-case.js';
import { LegalController } from './http/legal.controller.js';
import { PlatformRequestsController } from './http/platform-requests.controller.js';
import { PublicRequestsController } from './http/public-requests.controller.js';
import { SubmitThrottleInterceptor } from './http/submit-throttle.interceptor.js';
import { AltchaReplayGuard } from './infra/altcha-replay-guard.js';
import { AltchaService } from './infra/altcha.service.js';
import { LegalDocuments } from './infra/legal-documents.js';

/** Module onboarding (lot 1.3) : demandes de création (pub.challenge, pub.request), pages légales (pub.legal), file de traitement (pf.req.list, pf.req.get), approbation, création directe. */
@Module({
  controllers: [PublicRequestsController, LegalController, PlatformRequestsController],
  providers: [
    AltchaService,
    AltchaReplayGuard,
    SubmitThrottleInterceptor,
    CreateChallengeUseCase,
    SubmitRequestUseCase,
    LegalDocuments,
    GetLegalPageUseCase,
    ListRequestsUseCase,
    GetRequestUseCase,
  ],
})
export class OnboardingModule {}
