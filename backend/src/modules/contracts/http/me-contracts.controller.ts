import { Controller, Get, Header } from '@nestjs/common';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { ListSubscriberContractsUseCase } from '../application/list-subscriber-contracts.use-case.js';

/** Contrats du souscripteur connecté (me.contracts, lot 4.1). Toujours la personne du jeton ; jamais en cache partagé. */
@Controller('me/contracts')
export class MeContractsController {
  constructor(private readonly listContracts: ListSubscriberContractsUseCase) {}

  @Get()
  @Endpoint('me.contracts', 'list')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.listContracts.execute();
  }
}
