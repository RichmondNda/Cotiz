import { Body, Controller, Get, HttpCode, Post, UseInterceptors } from '@nestjs/common';
import { AssociationRequestInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { WithoutTenantContext } from '../../../shared/tenant-context/index.js';
import { CreateChallengeUseCase } from '../application/create-challenge.use-case.js';
import { SubmitRequestUseCase } from '../application/submit-request.use-case.js';
import { SubmitThrottleInterceptor } from './submit-throttle.interceptor.js';

/** pub.challenge, pub.request : formulaire de demande de création (`/demande`), sans authentification. */
@Controller('public')
export class PublicRequestsController {
  constructor(
    private readonly createChallenge: CreateChallengeUseCase,
    private readonly submitRequest: SubmitRequestUseCase,
  ) {}

  @Get('altcha-challenge')
  @Endpoint('pub.challenge', 'get')
  @Can('public')
  @WithoutTenantContext() // aucun accès à la base
  challenge() {
    return this.createChallenge.execute();
  }

  @Post('association-requests')
  @Endpoint('pub.request', 'create')
  @Can('public')
  @HttpCode(201)
  @UseInterceptors(SubmitThrottleInterceptor)
  submit(@Body() body: unknown) {
    return this.submitRequest.execute(parseInput(AssociationRequestInput, body));
  }
}
