import { createHmac, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type Config } from '../../../config.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { CODE_RULES, type CodePurpose } from '../domain/one-time-code.js';

/**
 * Essais de code d'un identifiant sans code en base (inconnu, ou sans code de cet usage) : comptés dans Redis comme
 * ceux d'un vrai code le sont en base, pour que `too_many_attempts` arrive au même essai (aucune fuite d'existence,
 * décision du lot 1.1). Durée : celle du code de cet usage. Clés : HMAC de l'identifiant, jamais en clair.
 */
@Injectable()
export class UncountedCodeAttempts {
  private readonly key: string;

  constructor(
    private readonly client: RedisClient,
    @Inject(CONFIG) config: Config,
  ) {
    this.key = config.LOG_PSEUDONYM_KEY ?? randomBytes(32).toString('hex');
  }

  /** Compte l'essai ; renvoie le nombre d'essais de cet identifiant pour cet usage. */
  async hit(purpose: CodePurpose, identifier: string): Promise<number> {
    const name = createHmac('sha256', this.key).update(`code-attempts:${purpose}:${identifier}`).digest('hex');
    const redisKey = `cotiz:codes:attempts:${name}`;
    const results = await this.client.redis
      .multi()
      .incr(redisKey)
      .expire(redisKey, CODE_RULES[purpose].ttlMs / 1000, 'NX')
      .exec();
    const count = Number(results?.[0]?.[1]);
    if (!Number.isInteger(count)) throw new Error('essais de code : compteur Redis illisible');
    return count;
  }
}
