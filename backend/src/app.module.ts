import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { ApiDocsModule } from './modules/docs/api-docs.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { TenantContextInterceptor, TenantContextModule } from './shared/tenant-context/index.js';

// Module racine de l'api. Les modules métier s'y ajoutent lot par lot.
@Module({})
export class AppModule {
  static register(config: Config): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        TenantContextModule,
        SystemModule,
        // Documentation interne (Scalar) : jamais en production.
        ...(config.NODE_ENV === 'production' ? [] : [ApiDocsModule]),
      ],
      // Toute route HTTP s'exécute dans une transaction de contexte, sauf @WithoutTenantContext().
      providers: [{ provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor }],
    };
  }
}
