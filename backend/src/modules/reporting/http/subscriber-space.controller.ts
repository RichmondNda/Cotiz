import { Controller, Get, Header } from '@nestjs/common';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { GetSubscriberDashboardUseCase } from '../application/get-subscriber-dashboard.use-case.js';

/**
 * Espace souscripteur (lot 3.2), lecture seule : tableau de bord (me.dash). Toujours la personne du jeton (espace
 * subscriber) ; propre à la personne : jamais en cache HTTP partagé.
 */
@Controller('me')
export class SubscriberSpaceController {
  constructor(private readonly dashboard: GetSubscriberDashboardUseCase) {}

  @Get('dashboard')
  @Endpoint('me.dash', 'get')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  getDashboard() {
    return this.dashboard.execute();
  }
}
