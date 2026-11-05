import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { MembersModule } from '../members/members.public.js';
import { GetManagerDashboardUseCase } from './application/get-manager-dashboard.use-case.js';
import { GetPlatformDashboardUseCase } from './application/get-platform-dashboard.use-case.js';
import { GetProjectReportUseCase } from './application/get-project-report.use-case.js';
import { ManagerDashboardController } from './http/manager-dashboard.controller.js';
import { PlatformDashboardController } from './http/platform-dashboard.controller.js';
import { ProjectReportController } from './http/project-report.controller.js';

/**
 * Module reporting (lecture seule, architecture/01) : tableau de bord plateforme (pf.dashboard, lot 1.4), rapport de
 * projet (rp.report) et tableau de bord gestionnaire (as.dashboard, lot 2.6).
 */
@Module({
  imports: [MembersModule, IdentityModule],
  controllers: [PlatformDashboardController, ProjectReportController, ManagerDashboardController],
  providers: [GetPlatformDashboardUseCase, GetProjectReportUseCase, GetManagerDashboardUseCase],
})
export class ReportingModule {}
