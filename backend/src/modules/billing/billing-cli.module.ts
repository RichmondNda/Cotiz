import { Module } from '@nestjs/common';
import { OutboxModule } from '../../shared/outbox/index.js';
import { SeedDevPlansUseCase } from './application/seed-dev-plans.use-case.js';
import { SeedDevSubscriptionsUseCase } from './application/seed-dev-subscriptions.use-case.js';

/** Scripts d'exploitation du module billing (src/cli.ts) : plans et abonnements de développement. */
@Module({
  imports: [OutboxModule],
  providers: [SeedDevPlansUseCase, SeedDevSubscriptionsUseCase],
  exports: [SeedDevPlansUseCase, SeedDevSubscriptionsUseCase],
})
export class BillingCliModule {}
