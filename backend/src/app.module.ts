import { type DynamicModule, Module } from '@nestjs/common';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { SystemModule } from './modules/system/system.module.js';

// Module racine de l'api. Les modules métier s'y ajoutent lot par lot.
@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [ConfigModule.register(config), SystemModule],
    };
  }
}
