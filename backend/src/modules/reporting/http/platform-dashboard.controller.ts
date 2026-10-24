import { Controller, Get } from '@nestjs/common';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { GetPlatformDashboardUseCase } from '../application/get-platform-dashboard.use-case.js';

/** pf.dashboard : tableau de bord de la plateforme (tout le personnel). */
@Controller('platform/dashboard')
export class PlatformDashboardController {
  constructor(private readonly dashboard: GetPlatformDashboardUseCase) {}

  @Get()
  @Endpoint('pf.dashboard', 'get')
  @Can('platform.associations.read')
  get() {
    return this.dashboard.execute();
  }
}
