import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { FilesWorkerModule } from './modules/files/files-worker.module.js';
import { createLogger, type Logger, LoggingModule } from './shared/logging/index.js';
import { OutboxWorkerModule } from './shared/outbox/worker.js';
import { SchedulerModule } from './shared/scheduler/index.js';
import { StorageModule } from './shared/storage/index.js';
import { WorkerTenantContextModule } from './shared/tenant-context/worker.js';

// Module racine du worker : relais outbox, files events et files, tâches planifiées (lot 0.5) ; les lots suivants
// y ajoutent leurs files et tâches.
@Module({})
export class WorkerModule {
  static register(config: Config, options: { logger?: Logger } = {}): DynamicModule {
    return {
      module: WorkerModule,
      // Tâches : withTenantContext(), espace system autorisé dans ce processus seulement.
      imports: [
        ConfigModule.register(config),
        LoggingModule.register(options.logger ?? createLogger(config, { name: 'worker' })),
        WorkerTenantContextModule,
        OutboxWorkerModule,
        SchedulerModule,
        StorageModule,
        FilesWorkerModule,
      ],
    };
  }
}
