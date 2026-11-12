import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { EvaluateRemindersUseCase } from './application/evaluate-reminders.use-case.js';

/**
 * Partie worker du module reminders : tâche `reminders.evaluate` (jobs.yaml : quotidienne 08:30 dans le fuseau de
 * chaque association), lancée toutes les heures à la demie ; chaque passage traite les associations où il est l'heure.
 */
@Module({
  providers: [EvaluateRemindersUseCase],
  exports: [EvaluateRemindersUseCase],
})
export class RemindersWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly evaluate: EvaluateRemindersUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'reminders.evaluate',
      pattern: '30 * * * *',
      run: () => this.evaluate.execute(new Date()),
    });
  }
}
