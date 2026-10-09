import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { OutboxWorkerModule } from './shared/outbox/worker.js';
import { WorkerTenantContextModule } from './shared/tenant-context/worker.js';

// Module racine du worker : relais outbox et file events (lot 0.5) ; les autres files et tâches planifiées s'y ajoutent.
@Module({})
export class WorkerModule {
  static register(config: Config): DynamicModule {
    return {
      module: WorkerModule,
      // Tâches : withTenantContext(), espace system autorisé dans ce processus seulement.
      imports: [ConfigModule.register(config), WorkerTenantContextModule, OutboxWorkerModule],
    };
  }
}
