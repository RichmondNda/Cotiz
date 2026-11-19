import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { IssueInvoicesUseCase } from './application/issue-invoices.use-case.js';
import { PublicPlansCacheConsumer } from './events/public-plans-cache.consumer.js';

/**
 * Partie worker du module billing : invalidation du cache des plans publics ; tâche `billing.issue-invoices`
 * (jobs.yaml : quotidienne, lot 4.6), lancée toutes les heures à :15 et rejouable : chaque passage traite le jour
 * local de chaque association (une période n'est jamais facturée deux fois).
 */
@Module({
  providers: [PublicPlansCacheConsumer, IssueInvoicesUseCase],
  exports: [IssueInvoicesUseCase],
})
export class BillingWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly issueInvoices: IssueInvoicesUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'billing.issue-invoices',
      pattern: '15 * * * *',
      run: () => this.issueInvoices.execute(new Date()).then(() => undefined),
    });
  }
}
