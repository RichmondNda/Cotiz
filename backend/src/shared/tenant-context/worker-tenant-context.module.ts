import { Global, Module } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { TenantDatabase, WORKER_PROCESS } from './tenant-database.js';

/** Pool PostgreSQL du processus worker : withTenantContext() y accepte l'espace system. */
@Global()
@Module({
  providers: [
    {
      provide: TenantDatabase,
      inject: [CONFIG],
      useFactory: (config: Config) =>
        new TenantDatabase({
          connectionString: config.DATABASE_URL,
          max: config.DATABASE_POOL_MAX,
          [WORKER_PROCESS]: true,
        }),
    },
  ],
  exports: [TenantDatabase],
})
export class WorkerTenantContextModule {}
