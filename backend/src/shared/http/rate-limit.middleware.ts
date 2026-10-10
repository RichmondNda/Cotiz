import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { DomainProblem } from './domain-problem.js';
import { COUNTER_STORE, type CounterStore, WINDOW_SECONDS } from './rate-limit.interceptor.js';

/** Sondes de l'orchestrateur : jamais limitées (un 429 ferait déclarer l'instance malade). */
const HEALTH = /\/health\/(live|ready)(\?|$)/;

/**
 * Plafond par IP (RATE_LIMIT_IP_PER_MIN, fenêtre d'une minute), AVANT les gardes : une requête refusée par une garde
 * (jeton invalide, association d'un autre) compte aussi. IP vue par Express, selon TRUST_PROXY_HOPS. Redis
 * indisponible : la requête passe.
 */
@Injectable()
export class IpRateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(IpRateLimitMiddleware.name);

  constructor(
    @Inject(COUNTER_STORE) private readonly counters: CounterStore,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  async use(
    req: { ip?: string | undefined; originalUrl: string },
    res: { setHeader(name: string, value: string): unknown },
    next: (error?: unknown) => void,
  ): Promise<void> {
    if (HEALTH.test(req.originalUrl)) {
      next();
      return;
    }
    let hit: { count: number; resetSeconds: number };
    try {
      hit = await this.counters.hit(`ip:${req.ip ?? 'inconnue'}`, WINDOW_SECONDS);
    } catch (error) {
      this.logger.warn(`limitation de débit indisponible : ${(error as Error).message}`);
      next();
      return;
    }
    if (hit.count > this.config.RATE_LIMIT_IP_PER_MIN) {
      res.setHeader('Retry-After', String(hit.resetSeconds));
      next(new DomainProblem('too_many_requests'));
      return;
    }
    next();
  }
}
