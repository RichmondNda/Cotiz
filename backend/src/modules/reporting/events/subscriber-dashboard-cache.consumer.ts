import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../../config.js';
import { paymentNoticeOf } from '../../ledger/ledger.public.js';
import { enrollmentOwnerOf } from '../../members/members.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { invalidateSubscriberDashboard } from '../infra/subscriber-dashboard-cache.js';

/**
 * Événements qui changent un chiffre du tableau de bord d'un souscripteur (architecture/09 : synthèse souscripteur,
 * « événements le concernant » ; events.yaml). Un changement de projet (nom, clôture) touche toutes ses cartes : il
 * n'invalide rien, l'entrée expire en 30 s.
 */
export const SUBSCRIBER_DASHBOARD_EVENTS: readonly EventType[] = [
  'member.enrolled',
  'member.withdrawn',
  'payment.declared',
  'payment.validated',
  'payment.rejected',
  'payment.reverted',
  'installment.late',
  'user.activated',
  // Appartenance changée (rôle retiré, lot 4.5) : ses associations visibles changent.
  'team.changed',
];

/** Personne nommée par l'événement (`payload.userId`) ; sinon `null`. */
export function payloadUserOf(event: EventEnvelope): string | null {
  const userId = event.payload.userId;
  return typeof userId === 'string' ? userId : null;
}

/**
 * Invalide le tableau de bord en cache de la personne concernée ; me.dash le recalcule à la lecture suivante.
 * `payment.reverted` et `member.withdrawn` ne nomment pas la personne : relue dans le contexte de l'association
 * (paiement, inscription). Rejoué, il invalide une fois de plus (sans effet) ; Redis en panne : erreur, l'événement
 * est retraité.
 */
@Injectable()
export class SubscriberDashboardCacheConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly db: TenantDatabase,
    @Inject(CONFIG) config: Config,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    this.redis.on(
      'error',
      AsyncLocalStorage.bind((error: Error) => {
        Logger.warn(`redis : ${error.message}`, SubscriberDashboardCacheConsumer.name);
      }),
    );
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'subscriber-dashboard-cache',
      types: SUBSCRIBER_DASHBOARD_EVENTS,
      ownTransactions: true,
      handle: async (event) => {
        const userId = await this.userOf(event);
        if (userId) await invalidateSubscriberDashboard(this.redis, userId);
      },
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.redis.disconnect();
  }

  private async userOf(event: EventEnvelope): Promise<string | null> {
    const named = payloadUserOf(event);
    if (named) return named;
    const aid = event.associationId;
    if (!aid) return null;
    const inAssociation = <T>(fn: () => Promise<T>) =>
      this.db.withTenantContext({ space: 'association', associationId: aid }, fn);
    if (event.type === 'payment.reverted' && typeof event.payload.paymentId === 'string') {
      const paymentId = event.payload.paymentId;
      return (await inAssociation(() => paymentNoticeOf(aid, paymentId)))?.userId ?? null;
    }
    if (event.type === 'member.withdrawn' && typeof event.payload.enrollmentId === 'string') {
      const enrollmentId = event.payload.enrollmentId;
      return inAssociation(() => enrollmentOwnerOf(aid, enrollmentId));
    }
    return null;
  }
}
