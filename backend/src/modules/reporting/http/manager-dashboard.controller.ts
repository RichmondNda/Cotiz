import { Controller, Get, Param } from '@nestjs/common';
import { AssociationParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetManagerDashboardUseCase } from '../application/get-manager-dashboard.use-case.js';

/** as.dashboard : tableau de bord gestionnaire ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/dashboard')
export class ManagerDashboardController {
  constructor(private readonly dashboard: GetManagerDashboardUseCase) {}

  @Get()
  @Endpoint('as.dashboard', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    const { aid } = parseInput(AssociationParams, params);
    return this.dashboard.execute(aid);
  }
}
