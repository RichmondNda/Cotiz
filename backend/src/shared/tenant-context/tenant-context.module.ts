import { Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { TenantDatabase } from './tenant-database.js';

/** Pool PostgreSQL unique du processus (api ou worker), via PgBouncer en cotiz_app. */
@Global()
@Module({
  providers: [
    {
      provide: TenantDatabase,
      inject: [CONFIG],
      useFactory: (config: Config) => new TenantDatabase(config.DATABASE_URL, config.DATABASE_POOL_MAX),
    },
  ],
  exports: [TenantDatabase],
})
export class TenantContextModule {}
