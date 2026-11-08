import { Body, Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetSubscriberContractUseCase } from '../application/get-subscriber-contract.use-case.js';
import { SignContractUseCase } from '../application/sign-contract.use-case.js';

const Params = ENDPOINTS['me.contract'].operations.get.request.params;
const SignBody = ENDPOINTS['me.sign'].operations.sign.request.body;

/**
 * Contrat du souscripteur connecté (lot 4.1, espace subscriber) : lecture (me.contract) et signature (me.sign,
 * Idempotency-Key contrôlée par l'intercepteur). Toujours la personne du jeton ; jamais en cache HTTP partagé.
 */
@Controller('me/projects/:pid/contract')
export class SubscriberContractsController {
  constructor(
    private readonly getContract: GetSubscriberContractUseCase,
    private readonly signContract: SignContractUseCase,
  ) {}

  @Get()
  @Endpoint('me.contract', 'get')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  get(@Param() params: unknown) {
    return this.getContract.execute(parseInput(Params, params).pid);
  }

  @Post('sign')
  @HttpCode(201)
  @Endpoint('me.sign', 'sign')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  sign(@Param() params: unknown, @Body() body: unknown) {
    return this.signContract.execute(parseInput(Params, params).pid, parseInput(SignBody, body));
  }
}
