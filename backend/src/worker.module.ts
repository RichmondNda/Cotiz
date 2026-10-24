import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { BillingWorkerModule } from './modules/billing/billing-worker.module.js';
import { FilesWorkerModule } from './modules/files/files-worker.module.js';
import { IdentityWorkerModule } from './modules/identity/identity-worker.module.js';
import { ReportingWorkerModule } from './modules/reporting/reporting-worker.module.js';
import { createLogger, type Logger, LoggingModule } from './shared/logging/index.js';
import { MetricsModule } from './shared/metrics/index.js';
import { OutboxWorkerModule } from './shared/outbox/worker.js';
import { QueueMetricsModule } from './shared/queues/queue-metrics.js';
import { SchedulerModule } from './shared/scheduler/index.js';
import { StorageModule } from './shared/storage/index.js';
import { TelemetryModule } from './shared/telemetry/index.js';
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
        MetricsModule.register('worker'),
        TelemetryModule.register('worker'),
        WorkerTenantContextModule,
        OutboxWorkerModule,
        QueueMetricsModule,
        SchedulerModule,
        StorageModule,
        FilesWorkerModule,
        IdentityWorkerModule,
        BillingWorkerModule,
        ReportingWorkerModule,
      ],
    };
  }
}
