import { Injectable } from '@nestjs/common';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { LOGIN_LOCK_MS, MAX_MFA_ATTEMPTS, MFA_TOKEN_TTL_MS } from '../domain/login-policy.js';
import { TOTP_STEP_SECONDS, TOTP_WINDOW } from '../domain/totp.js';

const LOCK_SECONDS = LOGIN_LOCK_MS / 1000;
/** Un pas accepté reste refusé tant qu'il peut encore être accepté (fenêtre ± TOTP_WINDOW), plus une marge. */
const USED_STEP_SECONDS = TOTP_STEP_SECONDS * (2 * TOTP_WINDOW + 2);

/**
 * Essais de second facteur (lot 4.7), dans Redis, par personne (le compte est connu : le mot de passe a été vérifié) :
 * 5 codes faux en 15 min → `too_many_attempts` jusqu'à la fin de la fenêtre ; un succès efface le compteur. Un code
 * TOTP déjà accepté (même pas) est refusé : il ne se rejoue pas. Redis indisponible : l'erreur remonte (refus).
 */
@Injectable()
export class MfaAttempts {
  constructor(private readonly client: RedisClient) {}

  async blocked(userId: string): Promise<boolean> {
    const count = Number((await this.client.redis.get(failuresKey(userId))) ?? 0);
    return count >= MAX_MFA_ATTEMPTS;
  }

  /** Compte un code faux ; `true` si la personne est désormais bloquée. */
  async fail(userId: string): Promise<boolean> {
    const key = failuresKey(userId);
    const results = await this.client.redis.multi().incr(key).expire(key, LOCK_SECONDS, 'NX').exec();
    const count = Number(results?.[0]?.[1]);
    if (!Number.isInteger(count)) throw new Error('essais de second facteur : compteur Redis illisible');
    return count >= MAX_MFA_ATTEMPTS;
  }

  async succeed(userId: string): Promise<void> {
    await this.client.redis.del(failuresKey(userId));
  }

  /** Consomme le jeton de second facteur (`jti`) ; `false` s'il a déjà ouvert une session. */
  async consumeToken(jti: string): Promise<boolean> {
    const set = await this.client.redis.set(`cotiz:mfa:token:${jti}`, '1', 'EX', MFA_TOKEN_TTL_MS / 1000 + 60, 'NX');
    return set === 'OK';
  }

  /** Réserve le pas TOTP accepté ; `false` s'il l'a déjà été (rejeu). */
  async claimStep(userId: string, step: number): Promise<boolean> {
    const set = await this.client.redis.set(
      `cotiz:mfa:step:${userId}:${String(step)}`,
      '1',
      'EX',
      USED_STEP_SECONDS,
      'NX',
    );
    return set === 'OK';
  }
}

const failuresKey = (userId: string) => `cotiz:mfa:failures:${userId}`;
