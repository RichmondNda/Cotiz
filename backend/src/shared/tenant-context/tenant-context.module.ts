import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { HttpScopeMiddleware } from './http-scope.middleware.js';
import { TenantDatabase } from './tenant-database.js';

/**
 * Pools PostgreSQL du processus api : cotiz_app (via PgBouncer) ; cotiz_platform (BYPASSRLS) pour les routes /platform
 * seulement (PLATFORM_DATABASE_URL, exigée en production ; absente, ces routes échouent). L'espace system y est refusé.
 */
@Global()
@Module({
  providers: [
    {
      provide: TenantDatabase,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        new TenantDatabase({
          connectionString: config.DATABASE_URL,
          platformConnectionString: config.PLATFORM_DATABASE_URL,
          max: config.DATABASE_POOL_MAX,
          platformMax: config.PLATFORM_DATABASE_POOL_MAX,
        }),
    },
  ],
  exports: [TenantDatabase],
})
export class TenantContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpScopeMiddleware).forRoutes('{*path}');
  }
}
