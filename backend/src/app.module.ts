import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { ApiDocsModule } from './modules/docs/api-docs.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { SystemModule } from './modules/system/system.module.js';
import { HttpConventionsModule, ProblemFilter } from './shared/http/index.js';
import { IdempotencyInterceptor } from './shared/http/idempotency.interceptor.js';
import { IfMatchInterceptor } from './shared/http/if-match.interceptor.js';
import { RateLimitInterceptor } from './shared/http/rate-limit.interceptor.js';
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
        HttpConventionsModule,
        TenantContextModule,
        OutboxModule,
        StorageModule,
        SystemModule,
        FilesModule,
        // Documentation interne (Scalar) : jamais en production.
        ...(config.NODE_ENV === 'production' ? [] : [ApiDocsModule]),
      ],
      // Intercepteurs globaux, dans cet ordre : débit et idempotence avant toute transaction (la réponse mémorisée
      // l'est après le COMMIT), puis If-Match/ETag, puis la transaction de contexte (sauf @WithoutTenantContext()).
      providers: [
        { provide: APP_INTERCEPTOR, useExisting: RateLimitInterceptor },
        { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
        { provide: APP_INTERCEPTOR, useExisting: IfMatchInterceptor },
        { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
        { provide: APP_FILTER, useClass: ProblemFilter },
      ],
    };
  }
}
