import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../../config.js';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';

/**
 * Canal Redis Pub/Sub d'une personne (nt.stream, lot 4.2). Le message n'est que l'id de la notification : l'api relit
 * la ligne avec le périmètre de l'espace du flux, jamais le contenu publié (un message forgé ne fait rien fuiter).
 */
export const notificationChannelOf = (userId: string) => `${REDIS_PREFIX}:notifications:user:${userId}`;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Worker : annonce les notifications créées, après le COMMIT (lecture possible par l'api). Redis absent : le flux
 * manque l'annonce, la cloche reste juste (compteur, liste) et la reprise `Last-Event-ID` rattrape à la reconnexion.
 */
@Injectable()
export class NotificationAnnouncer {
  private readonly logger = new Logger(NotificationAnnouncer.name);

  constructor(private readonly client: RedisClient) {}

  async announce(created: readonly { userId: string; notificationId: string }[]): Promise<void> {
    for (const { userId, notificationId } of created) {
      try {
        await this.client.redis.publish(notificationChannelOf(userId), notificationId);
      } catch (error) {
        this.logger.warn({ msg: 'notification non annoncée au flux', err: (error as Error).name });
      }
    }
  }
}

/** Un flux ouvert : reçoit les annonces ; `evict` le ferme quand la personne en ouvre trop. */
export interface StreamListener {
  onMessage: (notificationId: string) => void;
  evict: () => void;
}

/** Flux ouverts en même temps par une personne (onglets, appareils) : au-delà, le plus ancien est fermé. */
export const MAX_STREAMS_PER_USER = 5;
/** Attente maximale de l'abonnement Redis (Redis absent : le flux se ferme, le client se reconnectera). */
const SUBSCRIBE_TIMEOUT_MS = 5_000;

/**
 * Api : une connexion Redis en mode abonné par processus, partagée par tous les flux ouverts (un canal par personne,
 * abonné tant qu'un flux de la personne est ouvert). Entre réplicas : chaque api reçoit les annonces de ses flux.
 * Connexion créée au démarrage, hors de toute requête : ses rappels ne portent l'identité d'aucune requête (journaux).
 * Au plus MAX_STREAMS_PER_USER flux par personne et par processus : chaque annonce coûte une lecture en base par flux.
 */
@Injectable()
export class NotificationStreamHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamHub.name);
  private readonly subscriber: Redis;
  /** Par canal, les flux dans l'ordre d'ouverture (Set : ordre d'insertion). */
  private readonly listeners = new Map<string, Set<StreamListener>>();

  constructor(@Inject(CONFIG) config: Config) {
    this.subscriber = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: null });
    this.subscriber.on('error', (error: Error) => {
      this.logger.warn(`redis (flux) : ${error.message}`);
    });
    this.subscriber.on('message', (channel: string, message: string) => {
      if (!UUID.test(message)) return;
      this.listeners.get(channel)?.forEach((listener) => {
        listener.onMessage(message);
      });
    });
  }

  /** Socket ouverte au démarrage (hors requête) ; Redis absent : ioredis se reconnecte seul. */
  onModuleInit(): void {
    this.subscriber.connect().catch((error: unknown) => {
      this.logger.warn(`redis (flux) : ${(error as Error).message}`);
    });
  }

  /** Flux ouverts sur le canal d'une personne (tests, métriques). */
  openStreams(userId: string): number {
    return this.listeners.get(notificationChannelOf(userId))?.size ?? 0;
  }

  /**
   * Écoute le canal de la personne ; résolu quand l'abonnement est posé (sinon rejeté, rien ne reste enregistré).
   * Renvoie la fonction de désabonnement.
   */
  async listen(userId: string, listener: StreamListener): Promise<() => void> {
    const channel = notificationChannelOf(userId);
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    const stop = () => {
      const current = this.listeners.get(channel);
      if (!current?.delete(listener) || current.size > 0) return;
      this.listeners.delete(channel);
      this.subscriber
        .unsubscribe(channel)
        // Un flux rouvert pendant le désabonnement : on se réabonne, sinon il n'entendrait plus rien.
        .then(() => (this.listeners.has(channel) ? this.subscriber.subscribe(channel) : undefined))
        .catch(() => undefined);
    };
    // Trop de flux pour cette personne : le plus ancien est fermé.
    while (set.size > MAX_STREAMS_PER_USER) {
      const oldest = set.values().next().value;
      if (!oldest) break;
      set.delete(oldest);
      oldest.evict();
    }
    let timer: NodeJS.Timeout | undefined;
    try {
      // Abonnement idempotent : Redis l'ignore si le canal est déjà suivi (deux flux ouverts en même temps).
      await Promise.race([
        this.subscriber.subscribe(channel),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('abonnement Redis trop lent'));
          }, SUBSCRIBE_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      stop();
      throw error;
    } finally {
      clearTimeout(timer);
    }
    return stop;
  }

  onModuleDestroy(): void {
    this.subscriber.disconnect();
    this.listeners.clear();
  }
}
