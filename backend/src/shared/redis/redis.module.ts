import { Global, Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../config.js';

/**
 * Client Redis de l'api (limitation de débit, idempotence). Commandes bornées à 500 ms : Redis lent ou absent ne
 * doit jamais bloquer une requête (chaque usage décide alors : laisser passer ou refuser).
 */
@Injectable()
export class RedisClient implements OnModuleDestroy {
  readonly redis: Redis;
  private readonly logger = new Logger(RedisClient.name);

  constructor(@Inject(CONFIG) config: Config) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1, commandTimeout: 500 });
    this.redis.on('error', (error) => {
      this.logger.warn(`redis : ${error.message}`);
    });
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }
}

@Global()
@Module({ providers: [RedisClient], exports: [RedisClient] })
export class RedisModule {}
