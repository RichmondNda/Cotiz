import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';

// Module racine du worker : relais outbox (lot 0.5), files BullMQ et tâches planifiées s'y ajoutent.
@Module({})
export class WorkerModule {
  static register(config: Config): DynamicModule {
    return {
      module: WorkerModule,
      imports: [ConfigModule.register(config)],
    };
  }
}
