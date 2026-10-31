import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { RefreshInstallmentStatusesUseCase } from './application/refresh-installment-statuses.use-case.js';

/**
 * Partie worker du module ledger : tâche `installments.refresh-statuses` (jobs.yaml : quotidienne 01:00 dans le fuseau
 * de chaque association), lancée toutes les heures ; chaque passage traite les associations où il est 01:00.
 */
@Module({
  providers: [RefreshInstallmentStatusesUseCase],
  exports: [RefreshInstallmentStatusesUseCase],
})
export class LedgerWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly refreshStatuses: RefreshInstallmentStatusesUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'installments.refresh-statuses',
      pattern: '0 * * * *',
      run: () => this.refreshStatuses.execute(new Date()),
    });
  }
}
