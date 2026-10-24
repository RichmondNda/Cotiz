import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { RefreshPlatformStatsUseCase } from './application/refresh-platform-stats.use-case.js';

/** Partie worker du module reporting : tâche `stats.refresh` (jobs.yaml : toutes les 15 min). */
@Module({
  providers: [RefreshPlatformStatsUseCase],
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
