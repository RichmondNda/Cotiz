import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { CONFIG, type Config } from '../../config.js';
import { RedisClient } from '../redis/redis.module.js';
import { currentRequestInfo } from '../request-info/index.js';
import { getRequestContext } from '../tenant-context/index.js';
import { DomainProblem } from './domain-problem.js';
import { endpointOf } from './endpoint.js';

/** Compteur à fenêtre fixe : nombre d'appels dans la fenêtre courante et secondes avant sa fin. */
export interface CounterStore {
  hit(key: string, windowSeconds: number): Promise<{ count: number; resetSeconds: number }>;
}

export const COUNTER_STORE = Symbol('COUNTER_STORE');

export const WINDOW_SECONDS = 60;

/** Compteurs Redis : INCR, puis EXPIRE à la première occurrence (NX), dans une seule transaction. */
@Injectable()
export class RedisCounterStore implements CounterStore {
  constructor(private readonly client: RedisClient) {}

  async hit(key: string, windowSeconds: number): Promise<{ count: number; resetSeconds: number }> {
    const redisKey = `cotiz:rl:${key}`;
    const results = await this.client.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .ttl(redisKey)
      .exec();
    const [[, count] = [], , [, ttl] = []] = results ?? [];
    return { count: Number(count), resetSeconds: Math.max(1, Number(ttl)) };
  }
}

/** Retry-After quand le compteur d'un endpoint `rateLimited` est illisible (Redis indisponible). */
const UNAVAILABLE_RETRY_SECONDS = 30;

/**
 * Limitation de débit (architecture/02) après les gardes, quand l'acteur est connu ; fenêtre d'une minute :
 * - par association, sur les requêtes de son espace (RATE_LIMIT_ASSOCIATION_PER_MIN) ;
 * - par utilisateur (ou IP sans utilisateur) et par endpoint, pour les endpoints `rateLimited` du contrat
 *   (RATE_LIMIT_ENDPOINT_PER_MIN).
 * Le plafond par IP est posé avant les gardes (IpRateLimitMiddleware). Au-delà : 429 too_many_requests et
 * `Retry-After`. Redis indisponible : le plafond par association laisse passer ; un endpoint `rateLimited`
 * (connexion, codes) est refusé, jamais ouvert à des essais illimités.
 */
@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(COUNTER_STORE) private readonly counters: CounterStore,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') return next.handle();
    const tenant = getRequestContext(context.switchToHttp().getRequest<object>());
    const endpoint = endpointOf(this.reflector, context);
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    const refuse = (retryAfter: number) => {
      response.setHeader('Retry-After', String(retryAfter));
      return new DomainProblem('too_many_requests');
    };

    // Routes `/associations/{aid}/…` seulement : GET /me porte aussi l'association courante (fonctionnalités de son
    // plan, lot 4.1) sans être une requête de l'association (`rateLimited: false`) ; sinon des collègues qui épuisent
    // le quota de l'association bloqueraient le /me de chacun.
    if (tenant?.space === 'association' && tenant.associationId && endpoint?.def.space === 'association') {
      const hit = await this.hit(`aid:${tenant.associationId}`);
      if (hit && hit.count > this.config.RATE_LIMIT_ASSOCIATION_PER_MIN) throw refuse(hit.resetSeconds);
    }
    if (endpoint?.def.flags.rateLimited) {
      const who = tenant?.userId ? `user:${tenant.userId}` : `ip:${currentRequestInfo()?.ip ?? 'inconnue'}`;
      const hit = await this.hit(`ep:${endpoint.id}:${who}`);
      if (!hit) throw refuse(UNAVAILABLE_RETRY_SECONDS);
      if (hit.count > this.config.RATE_LIMIT_ENDPOINT_PER_MIN) throw refuse(hit.resetSeconds);
    }
    return next.handle();
  }

  /** `null` si le compteur est illisible (Redis indisponible). */
  private async hit(key: string): Promise<{ count: number; resetSeconds: number } | null> {
    try {
      return await this.counters.hit(key, WINDOW_SECONDS);
    } catch (error) {
      this.logger.warn(`limitation de débit indisponible : ${(error as Error).message}`);
      return null;
    }
  }
}
