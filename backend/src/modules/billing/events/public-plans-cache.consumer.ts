import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { invalidatePublicPlans } from '../infra/public-plans-cache.js';

/**
 * plan.updated → nouvelle génération du cache des plans publics (events.yaml : « cache: plans publics ») ; pub.plans
 * le reconstruit à la lecture suivante. Rejoué, il invalide une fois de plus (sans effet) ; Redis en panne : erreur,
 * l'événement est retraité.
 */
@Injectable()
export class PublicPlansCacheConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) config: Config,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.redis.on(
      'error',
      AsyncLocalStorage.bind((error: Error) => {
        Logger.warn(`redis : ${error.message}`, PublicPlansCacheConsumer.name);
      }),
    );
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'plans-public-cache',
      types: ['plan.updated'],
      handle: () => invalidatePublicPlans(this.redis),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.redis.disconnect();
  }
}
