import { Global, type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { HttpScopeMiddleware } from './http-scope.middleware.js';
import { TenantDatabase } from './tenant-database.js';

/** Pool PostgreSQL unique du processus api, via PgBouncer en cotiz_app. L'espace system y est refusé. */
@Global()
@Module({
  providers: [
    {
      provide: TenantDatabase,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        new TenantDatabase({ connectionString: config.DATABASE_URL, max: config.DATABASE_POOL_MAX }),
    },
  ],
  exports: [TenantDatabase],
})
export class TenantContextModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(HttpScopeMiddleware).forRoutes('{*path}');
  }
}
