import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ExtendRollingSchedulesUseCase } from './application/extend-rolling-schedules.use-case.js';
import { ContractScheduleConsumer } from './events/contract-schedule.consumer.js';

/**
 * Partie worker du module members : tâche `schedule.extend-rolling` (jobs.yaml : mensuelle, le 1er à 01:00) ;
 * échéancier généré à la signature d'un contrat (`contract.signed`, lot 4.1).
 */
@Module({
  providers: [ExtendRollingSchedulesUseCase, ContractScheduleConsumer],
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
