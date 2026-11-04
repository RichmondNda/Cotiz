import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.public.js';
import { GetPlatformDashboardUseCase } from './application/get-platform-dashboard.use-case.js';
import { GetProjectReportUseCase } from './application/get-project-report.use-case.js';
import { PlatformDashboardController } from './http/platform-dashboard.controller.js';
import { ProjectReportController } from './http/project-report.controller.js';

/**
 * Module reporting (lecture seule, architecture/01) : tableau de bord plateforme (pf.dashboard, lot 1.4), rapport de
 * projet (rp.report, lot 2.6).
 */
@Module({
  imports: [MembersModule],
  controllers: [PlatformDashboardController, ProjectReportController],
  providers: [GetPlatformDashboardUseCase, GetProjectReportUseCase],
})
export class ReportingModule {}
