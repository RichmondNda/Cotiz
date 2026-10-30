import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ExtendRollingSchedulesUseCase } from './application/extend-rolling-schedules.use-case.js';

/** Partie worker du module members : tâche `schedule.extend-rolling` (jobs.yaml : mensuelle, le 1er à 01:00). */
@Module({
  providers: [ExtendRollingSchedulesUseCase],
  exports: [ExtendRollingSchedulesUseCase],
})
export class MembersWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly extendRollingSchedules: ExtendRollingSchedulesUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'schedule.extend-rolling',
      pattern: '0 1 1 * *',
      run: () => this.extendRollingSchedules.execute(new Date()),
    });
  }
}
