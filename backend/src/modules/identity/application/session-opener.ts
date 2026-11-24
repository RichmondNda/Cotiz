import { Injectable } from '@nestjs/common';
import type { SessionSpace } from '@cotiz/contracts';
import { sessions } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import type { z } from 'zod';
import { canonicalIp } from '../../../shared/net/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { REFRESH_TOKEN_TTL_MS } from '../domain/login-policy.js';
import { AccessTokenSigner } from '../infra/access-token-signer.js';
import { newRefreshToken } from '../infra/refresh-token.js';
import { MfaFactors } from './mfa-factors.js';

type Space = z.infer<typeof SessionSpace>;

/** Session ouverte : jeton d'accès pour le corps, jeton de renouvellement pour le cookie (jamais dans le corps). */
export interface OpenedSession {
  accessToken: string;
  expiresAt: Date;
  space: Space;
  refreshToken: string;
  rememberMe: boolean;
  /** Fin de la connexion : durée du cookie persistant (« rester connecté »). */
  refreshMaxAgeMs: number;
}

/** Navigateur enregistré avec la session : borné, l'en-tête vient du client. */
const USER_AGENT_MAX = 512;

/**
 * Claim `mfa` d'un jeton d'accès (lot 4.7) : une session plateforme sans second facteur confirmé est restreinte à
 * l'enrôlement (SpaceGuard). Recalculé à l'ouverture et à chaque renouvellement.
 */
export async function mfaClaimFor(factors: MfaFactors, userId: string, space: Space): Promise<{ mfa?: 'enroll' }> {
  return space === 'platform' && !(await factors.hasConfirmed(userId)) ? { mfa: 'enroll' } : {};
}

/**
 * Nouvelle connexion (connexion, second facteur, activation) : session d'une nouvelle famille, 30 jours au plus (architecture/03),
 * jeton de renouvellement haché, jeton d'accès signé. Dans la transaction du cas d'usage appelant.
 */
@Injectable()
export class SessionOpener {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly factors: MfaFactors,
  ) {}

  async open(input: { userId: string; space: Space; rememberMe: boolean }, now = new Date()): Promise<OpenedSession> {
    const request = currentRequestInfo();
    const sessionId = newId();
    const refresh = newRefreshToken();
    await currentTx()
      .insert(sessions)
      .values({
        id: sessionId,
        userId: input.userId,
        refreshTokenHash: refresh.hash,
        familyId: newId(),
        space: input.space,
        ip: request?.ip ? canonicalIp(request.ip) : null,
        userAgent: request?.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
        rememberMe: input.rememberMe,
      });
    const access = await this.signer.sign(
      {
        sub: input.userId,
        space: input.space,
        sid: sessionId,
        ...(await mfaClaimFor(this.factors, input.userId, input.space)),
      },
      now,
    );
    return {
      accessToken: access.token,
      expiresAt: access.expiresAt,
      space: input.space,
      refreshToken: refresh.token,
      rememberMe: input.rememberMe,
      refreshMaxAgeMs: REFRESH_TOKEN_TTL_MS,
    };
  }
}
