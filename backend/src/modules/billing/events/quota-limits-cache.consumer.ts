import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from 'ioredis';
import type { EventEnvelope } from '@cotiz/contracts';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { invalidateAllQuotaLimits, invalidateQuotaLimits } from '../infra/quota-limits-cache.js';

/**
 * Limites de quotas en cache (events.yaml : « cache: quotas ») : plan.updated → toutes les associations,
 * subscription.plan_changed et association.updated (comptes gestionnaires autorisés) → celle de l'événement. Rejoué, il invalide une fois de plus (sans effet) ; Redis en panne :
 * erreur, l'événement est retraité.
 */
@Injectable()
export class QuotaLimitsCacheConsumer implements OnModuleInit, OnModuleDestroy {
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
        Logger.warn(`redis : ${error.message}`, QuotaLimitsCacheConsumer.name);
      }),
    );
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'quota-limits-cache',
      types: ['plan.updated', 'subscription.plan_changed', 'association.updated'],
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.redis.disconnect();
  }

  private async handle(event: EventEnvelope): Promise<void> {
    if (event.type === 'plan.updated') return invalidateAllQuotaLimits(this.redis);
    if (!event.associationId) throw new Error(`${event.type} sans association`);
    return invalidateQuotaLimits(this.redis, event.associationId);
  }
}
