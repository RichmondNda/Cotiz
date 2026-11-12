import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { MembersModule } from '../members/members.public.js';
import { GetManagerDashboardUseCase } from './application/get-manager-dashboard.use-case.js';
import { GetPlatformDashboardUseCase } from './application/get-platform-dashboard.use-case.js';
import { GetProjectReportUseCase } from './application/get-project-report.use-case.js';
import { GetSubscriberAssociationsUseCase } from './application/get-subscriber-associations.use-case.js';
import { GetSubscriberDashboardUseCase } from './application/get-subscriber-dashboard.use-case.js';
import { GetSubscriberHistoryUseCase } from './application/get-subscriber-history.use-case.js';
import { GetSubscriberProjectUseCase } from './application/get-subscriber-project.use-case.js';
import { ListSubscriberProjectsUseCase } from './application/list-subscriber-projects.use-case.js';
import { ManagerDashboardController } from './http/manager-dashboard.controller.js';
import { PlatformDashboardController } from './http/platform-dashboard.controller.js';
import { ProjectReportController } from './http/project-report.controller.js';
import { SubscriberSpaceController } from './http/subscriber-space.controller.js';

/**
 * Module reporting (lecture seule, architecture/01) : tableau de bord plateforme (pf.dashboard, lot 1.4), rapport de
 * projet (rp.report), tableau de bord gestionnaire (as.dashboard, lot 2.6) et espace souscripteur (me.dash,
 * me.projects, me.project ; lot 3.2).
 */
@Module({
  imports: [MembersModule, IdentityModule],
  controllers: [
    PlatformDashboardController,
    ProjectReportController,
    ManagerDashboardController,
    SubscriberSpaceController,
  ],
  providers: [
    GetPlatformDashboardUseCase,
    GetProjectReportUseCase,
    GetManagerDashboardUseCase,
    GetSubscriberDashboardUseCase,
    GetSubscriberHistoryUseCase,
    ListSubscriberProjectsUseCase,
    GetSubscriberProjectUseCase,
    GetSubscriberAssociationsUseCase,
  ],
})
export class ReportingModule {}
