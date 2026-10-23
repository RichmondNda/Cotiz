import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AltchaChallenge } from '@cotiz/contracts';
import { RedisClient } from '../../../shared/redis/redis.module.js';

/**
 * Usage unique d'un défi ALTCHA : son aléa est marqué dans Redis jusqu'à son échéance (SET NX). Une solution rejouée,
 * même avec une autre `Idempotency-Key`, est refusée.
 */
@Injectable()
export class AltchaReplayGuard {
  constructor(private readonly client: RedisClient) {}

  /** `true` à la première présentation du défi, `false` ensuite. */
  async claim(challenge: AltchaChallenge, now: Date = new Date()): Promise<boolean> {
    const key = `cotiz:altcha:used:${createHash('sha256').update(challenge.parameters.nonce).digest('hex')}`;
    const ttl = Math.max(1, challenge.parameters.expiresAt - Math.floor(now.getTime() / 1000) + 60);
    return (await this.client.redis.set(key, '1', 'EX', ttl, 'NX')) === 'OK';
  }
}
