import { Injectable, Logger } from '@nestjs/common';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';

/** Durée d'un compteur en cache : courte, la cloche est interrogée toutes les 30 s jusqu'au lot 4.2. */
export const UNREAD_TTL_SECONDS = 60;

/** Un compteur par personne et par espace courant, chacun avec sa propre expiration. */
export const unreadKeyOf = (userId: string, scope: string) => `${REDIS_PREFIX}:notifications:unread:${userId}:${scope}`;
/** Ensemble des compteurs en cache d'une personne : l'invalidation les retire tous. */
export const unreadScopesKeyOf = (userId: string) => `${REDIS_PREFIX}:notifications:unread:${userId}`;

/**
 * Compteur de notifications non lues en cache Redis (architecture/07), une clé par personne et par espace courant
 * (expiration propre à chacune). Invalidé à chaque création (worker) et à chaque lecture (api), après le COMMIT : toutes
 * les clés de la personne. Redis absent ou lent : lecture en base, invalidation perdue rattrapée par l'expiration ;
 * jamais d'erreur rendue à l'appelant.
 */
@Injectable()
export class UnreadCounter {
  private readonly logger = new Logger(UnreadCounter.name);

  constructor(private readonly client: RedisClient) {}

  async get(userId: string, scope: string): Promise<number | null> {
    try {
      const value = await this.client.redis.get(unreadKeyOf(userId, scope));
      if (value === null) return null;
      const n = Number(value);
      return Number.isSafeInteger(n) && n >= 0 ? n : null;
    } catch (error) {
      this.logger.warn({ msg: 'compteur de notifications illisible', err: (error as Error).name });
      return null;
    }
  }

  async set(userId: string, scope: string, count: number): Promise<void> {
    const key = unreadKeyOf(userId, scope);
    try {
      await this.client.redis
        .multi()
        .set(key, String(count), 'EX', UNREAD_TTL_SECONDS)
        .sadd(unreadScopesKeyOf(userId), key)
        .expire(unreadScopesKeyOf(userId), UNREAD_TTL_SECONDS)
        .exec();
    } catch (error) {
      this.logger.warn({ msg: 'compteur de notifications non mis en cache', err: (error as Error).name });
    }
  }

  async invalidate(userIds: Iterable<string>): Promise<void> {
    const people = [...new Set(userIds)];
    if (people.length === 0) return;
    try {
      for (const userId of people) {
        const scopes = unreadScopesKeyOf(userId);
        const keys = await this.client.redis.smembers(scopes);
        await this.client.redis.del(scopes, ...keys);
      }
    } catch (error) {
      this.logger.warn({ msg: 'compteur de notifications non invalidé', err: (error as Error).name });
    }
  }
}
