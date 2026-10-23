import { createHmac, randomBytes } from 'node:crypto';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import type { Observable } from 'rxjs';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { clientNetwork } from '../../../shared/net/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';

/** Demandes de création acceptées par IP et par heure (décision du lot 1.3), en plus des plafonds par minute. */
export const SUBMISSIONS_PER_HOUR = 5;
const WINDOW_SECONDS = 3600;
/** Retry-After quand le compteur est illisible (Redis indisponible) : refus, jamais d'envois illimités. */
const UNAVAILABLE_RETRY_SECONDS = 60;

/**
 * Limitation du formulaire public (pub.request) : chaque envoi compte, accepté ou refusé (défi faux, champ invalide).
 * Le rejeu d'une même `Idempotency-Key` est servi avant (intercepteur global) et ne compte pas. Compté par réseau
 * (adresse IPv4, /64 IPv6) ; clé : HMAC du réseau (clé de pseudonymisation), jamais l'adresse en clair.
 * Exploitation : derrière le proxy, TRUST_PROXY_HOPS doit être juste, sinon tous les envois partagent un compteur.
 */
@Injectable()
export class SubmitThrottleInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SubmitThrottleInterceptor.name);
  private readonly key: string;

  constructor(
    private readonly client: RedisClient,
    @Inject(CONFIG) config: Config,
  ) {
    this.key = config.LOG_PSEUDONYM_KEY ?? randomBytes(32).toString('hex');
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const response = context.switchToHttp().getResponse<{ setHeader(name: string, value: string): void }>();
    const refuse = (retryAfter: number) => {
      response.setHeader('Retry-After', String(retryAfter));
      return new DomainProblem('too_many_requests');
    };
    const network = clientNetwork(currentRequestInfo()?.ip ?? 'inconnue');
    const key = `cotiz:rl:pub.request:hour:${createHmac('sha256', this.key).update(network).digest('hex')}`;
    let count: number;
    let ttl: number;
    try {
      const results = await this.client.redis.multi().incr(key).expire(key, WINDOW_SECONDS, 'NX').ttl(key).exec();
      count = Number(results?.[0]?.[1]);
      ttl = Number(results?.[2]?.[1]);
      if (!Number.isInteger(count)) throw new Error('compteur illisible');
    } catch (error) {
      this.logger.warn({ msg: 'limitation des demandes indisponible', reason: (error as Error).message });
      throw refuse(UNAVAILABLE_RETRY_SECONDS);
    }
    if (count > SUBMISSIONS_PER_HOUR) throw refuse(Math.max(1, ttl));
    return next.handle();
  }
}
