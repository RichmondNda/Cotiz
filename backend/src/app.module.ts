import { type DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import type { Config } from './config.js';
import { ConfigModule } from './config.module.js';
import { ApiDocsModule } from './modules/docs/api-docs.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { DebugModule } from './modules/system/http/debug.controller.js';
import { SystemModule } from './modules/system/system.module.js';
import { HttpConventionsModule, ProblemFilter } from './shared/http/index.js';
import { IdempotencyInterceptor } from './shared/http/idempotency.interceptor.js';
import { IfMatchInterceptor } from './shared/http/if-match.interceptor.js';
import { RateLimitInterceptor } from './shared/http/rate-limit.interceptor.js';
import { AccessLogModule, createLogger, type Logger, LoggingModule } from './shared/logging/index.js';
import { HttpMetricsModule, MetricsModule } from './shared/metrics/index.js';
import { OutboxModule } from './shared/outbox/index.js';
import { RequestInfoModule } from './shared/request-info/index.js';
import { StorageModule } from './shared/storage/index.js';
import { TelemetryModule } from './shared/telemetry/index.js';
import { TenantContextInterceptor, TenantContextModule } from './shared/tenant-context/index.js';

// Module racine de l'api. Les modules métier s'y ajoutent lot par lot.
@Module({})
export class AppModule {
  /** `logger` : logger racine (tests qui lisent les journaux) ; sinon créé depuis la configuration. */
  static register(config: Config, options: { logger?: Logger } = {}): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.register(config),
        LoggingModule.register(options.logger ?? createLogger(config, { name: 'api' })),
        MetricsModule.register('api'),
        TelemetryModule.register('api'),
        RequestInfoModule,
        AccessLogModule,
        HttpMetricsModule,
        HttpConventionsModule,
        TenantContextModule,
        OutboxModule,
        StorageModule,
        SystemModule,
        FilesModule,
        // Documentation interne (Scalar) : jamais en production.
        ...(config.NODE_ENV === 'production' ? [] : [ApiDocsModule]),
        // Erreur provoquée (démonstration de l'observabilité) : en développement seulement.
        ...(config.NODE_ENV === 'development' ? [DebugModule] : []),
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
