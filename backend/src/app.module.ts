import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { ApiDocsModule } from './modules/docs/api-docs.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { ProblemFilter } from './shared/http/index.js';
import { OutboxModule } from './shared/outbox/index.js';
import { RequestInfoModule } from './shared/request-info/index.js';
import { StorageModule } from './shared/storage/index.js';
import { TenantContextInterceptor, TenantContextModule } from './shared/tenant-context/index.js';

// Module racine de l'api. Les modules métier s'y ajoutent lot par lot.
@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        RequestInfoModule,
        TenantContextModule,
        OutboxModule,
        StorageModule,
        SystemModule,
        FilesModule,
        // Documentation interne (Scalar) : jamais en production.
        ...(config.NODE_ENV === 'production' ? [] : [ApiDocsModule]),
      ],
      // Toute route HTTP s'exécute dans une transaction de contexte, sauf @WithoutTenantContext().
      providers: [
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
