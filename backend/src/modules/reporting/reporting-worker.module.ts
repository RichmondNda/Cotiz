import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ManagerDashboardCacheConsumer } from './events/manager-dashboard-cache.consumer.js';
import { RefreshPlatformStatsUseCase } from './application/refresh-platform-stats.use-case.js';

/**
 * Partie worker du module reporting : tâche `stats.refresh` (jobs.yaml : toutes les 15 min), invalidation du tableau de
 * bord gestionnaire en cache (lot 2.6).
 */
@Module({
  providers: [RefreshPlatformStatsUseCase, ManagerDashboardCacheConsumer],
  exports: [RefreshPlatformStatsUseCase],
})
export class ReportingWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly refreshStats: RefreshPlatformStatsUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({ name: 'stats.refresh', pattern: '*/15 * * * *', run: () => this.refreshStats.execute() });
  }
}
