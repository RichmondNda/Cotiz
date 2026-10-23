import { Module } from '@nestjs/common';
import { GetPlatformDashboardUseCase } from './application/get-platform-dashboard.use-case.js';
import { PlatformDashboardController } from './http/platform-dashboard.controller.js';

/** Module reporting (lecture seule, architecture/01) : tableau de bord plateforme (pf.dashboard, lot 1.4). */
@Module({
  controllers: [PlatformDashboardController],
  providers: [GetPlatformDashboardUseCase],
})
export class ReportingModule {}
