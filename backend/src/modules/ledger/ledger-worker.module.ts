import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { RefreshInstallmentStatusesUseCase } from './application/refresh-installment-statuses.use-case.js';
import { SendDueSoonRemindersUseCase } from './application/send-due-soon-reminders.use-case.js';

/**
 * Partie worker du module ledger : tâche `installments.refresh-statuses` (jobs.yaml : quotidienne 01:00 dans le fuseau
 * de chaque association) et `installments.due-soon` (08:00 locale, lot 2.5), lancées toutes les heures ; chaque passage
 * traite les associations où il est l'heure de la tâche.
 */
@Module({
  providers: [RefreshInstallmentStatusesUseCase, SendDueSoonRemindersUseCase],
  exports: [RefreshInstallmentStatusesUseCase, SendDueSoonRemindersUseCase],
})
export class LedgerWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly refreshStatuses: RefreshInstallmentStatusesUseCase,
    private readonly dueSoon: SendDueSoonRemindersUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'installments.refresh-statuses',
      pattern: '0 * * * *',
      run: () => this.refreshStatuses.execute(new Date()),
    });
    this.scheduled.define({
      name: 'installments.due-soon',
      pattern: '0 * * * *',
      run: () => this.dueSoon.execute(new Date()),
    });
  }
}
