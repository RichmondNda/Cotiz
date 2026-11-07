import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ManagerDashboardCacheConsumer } from './events/manager-dashboard-cache.consumer.js';
import { SubscriberDashboardCacheConsumer } from './events/subscriber-dashboard-cache.consumer.js';
import { RefreshPlatformStatsUseCase } from './application/refresh-platform-stats.use-case.js';

/**
 * Partie worker du module reporting : tâche `stats.refresh` (jobs.yaml : toutes les 15 min), invalidation du tableau de
 * bord gestionnaire (lot 2.6) et souscripteur (lot 3.2) en cache.
 */
@Module({
  providers: [RefreshPlatformStatsUseCase, ManagerDashboardCacheConsumer, SubscriberDashboardCacheConsumer],
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
