import { Injectable } from '@nestjs/common';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { ACCESS_TOKEN_TTL_MS } from '../domain/login-policy.js';

/** Un jeton d'accès vit 15 min : au-delà, la liste noire est inutile (marge d'une minute pour les horloges). */
const BLACKLIST_SECONDS = ACCESS_TOKEN_TTL_MS / 1000 + 60;

/**
 * Liste noire Redis des sessions (`sid`) révoquées (architecture/03) : leurs jetons d'accès encore valides sont
 * refusés dès la déconnexion ou la révocation de la famille, sans attendre leur expiration. Redis indisponible :
 * l'erreur remonte (jamais de jeton accepté sans vérification).
 */
@Injectable()
export class RevokedSessions {
  constructor(private readonly client: RedisClient) {}

  async revoke(sessionIds: string[]): Promise<void> {
    if (sessionIds.length === 0) return;
    const multi = this.client.redis.multi();
    for (const sid of sessionIds) multi.set(this.key(sid), '1', 'EX', BLACKLIST_SECONDS);
    const results = (await multi.exec()) ?? [];
    if (results.some(([error]) => error)) throw new Error('liste noire des sessions : écriture Redis refusée');
  }

  async isRevoked(sessionId: string): Promise<boolean> {
    return (await this.client.redis.exists(this.key(sessionId))) === 1;
  }

  private key(sessionId: string): string {
    return `cotiz:auth:revoked-sid:${sessionId}`;
  }
}
