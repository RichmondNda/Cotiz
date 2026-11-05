import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { invalidateManagerDashboard } from '../infra/manager-dashboard-cache.js';

/**
 * Événements qui changent un chiffre du tableau de bord gestionnaire (events.yaml, « cache: KPI » et compteur à
 * valider ; architecture/09 : `payment.*`, `member.*`), plus les codes à remettre et les projets qu'il présente.
 */
export const MANAGER_DASHBOARD_EVENTS: readonly EventType[] = [
  'member.enrolled',
  'member.withdrawn',
  'member.updated',
  'payment.declared',
  'payment.validated',
  'payment.rejected',
  'payment.reverted',
  'installment.late',
  'activation.code_issued',
  'activation.code_handed',
  'user.activated',
  'project.created',
  'project.updated',
  'project.published',
  'project.closed',
];

/** Associations concernées : celle de l'événement, ou celles du compte activé (`user.activated`). */
export function dashboardAssociationsOf(event: EventEnvelope): string[] {
  const ids = event.payload.associationIds;
  const listed = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  return [...new Set([...(event.associationId ? [event.associationId] : []), ...listed])];
}

/**
 * Invalide le tableau de bord en cache des associations concernées ; as.dashboard le recalcule à la lecture suivante.
 * Rejoué, il invalide une fois de plus (sans effet) ; Redis en panne : erreur, l'événement est retraité.
 */
@Injectable()
export class ManagerDashboardCacheConsumer implements OnModuleInit, OnModuleDestroy {
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
        Logger.warn(`redis : ${error.message}`, ManagerDashboardCacheConsumer.name);
      }),
    );
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'manager-dashboard-cache',
      types: MANAGER_DASHBOARD_EVENTS,
      handle: async (event) => {
        for (const associationId of dashboardAssociationsOf(event)) {
          await invalidateManagerDashboard(this.redis, associationId);
        }
      },
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.redis.disconnect();
  }
}
