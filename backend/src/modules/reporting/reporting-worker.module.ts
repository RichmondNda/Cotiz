import { Module, type OnModuleInit } from '@nestjs/common';
import { pdfRendererProvider } from '../documents/documents.public.js';
import { IdentityCliModule } from '../identity/identity.public.js';
import { MemberDirectory } from '../members/members.public.js';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ComputeUsageUseCase } from './application/compute-usage.use-case.js';
import { FailExportUseCase } from './application/fail-export.use-case.js';
import { GenerateExportUseCase } from './application/generate-export.use-case.js';
import { GetProjectReportUseCase } from './application/get-project-report.use-case.js';
import { ExportJobsConsumer } from './events/export-jobs.consumer.js';
import { ExportsProcessor } from './events/exports.processor.js';
import { ManagerDashboardCacheConsumer } from './events/manager-dashboard-cache.consumer.js';
import { SubscriberDashboardCacheConsumer } from './events/subscriber-dashboard-cache.consumer.js';
import { RefreshPlatformStatsUseCase } from './application/refresh-platform-stats.use-case.js';

/**
 * Partie worker du module reporting : tâches `stats.refresh` (jobs.yaml : toutes les 15 min) et `usage.daily` (lot 4.6), invalidation du tableau de
 * bord gestionnaire (lot 2.6) et souscripteur (lot 3.2) en cache ; exports (file `exports`, lot 4.6) : mêmes calculs que
 * rp.report et mb.list (annuaire du module members, comptes du module identity), PDF par le moteur du module documents.
 */
@Module({
  imports: [IdentityCliModule],
  providers: [
    RefreshPlatformStatsUseCase,
    ManagerDashboardCacheConsumer,
    SubscriberDashboardCacheConsumer,
    pdfRendererProvider,
    MemberDirectory,
    GetProjectReportUseCase,
    GenerateExportUseCase,
    FailExportUseCase,
    ExportJobsConsumer,
    ExportsProcessor,
    ComputeUsageUseCase,
  ],
  exports: [RefreshPlatformStatsUseCase, GenerateExportUseCase, ComputeUsageUseCase],
})
export class ReportingWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly refreshStats: RefreshPlatformStatsUseCase,
    private readonly computeUsage: ComputeUsageUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({ name: 'stats.refresh', pattern: '*/15 * * * *', run: () => this.refreshStats.execute() });
    // usage.daily (jobs.yaml : 02:00) : passage horaire, la veille de chaque association dès 02:00 locale.
    this.scheduled.define({
      name: 'usage.daily',
      pattern: '40 * * * *',
      run: () => this.computeUsage.execute(new Date()).then(() => undefined),
    });
  }
}
