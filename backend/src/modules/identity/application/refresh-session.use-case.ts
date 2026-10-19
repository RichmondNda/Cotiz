import { Injectable } from '@nestjs/common';
import { sessions, users } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { canonicalIp } from '../../../shared/net/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
import { type AfterCommit, afterCommit, currentTx } from '../../../shared/tenant-context/index.js';
import { AccessTokenSigner } from '../infra/access-token-signer.js';
import { hashRefreshToken, newRefreshToken } from '../infra/refresh-token.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';
import type { OpenedSession } from './session-opener.js';
import { SessionFamilies } from './session-families.js';
import { SpaceAccess } from './space-access.js';

/** Navigateur enregistré avec la session : borné, l'en-tête vient du client. */
const USER_AGENT_MAX = 512;

/**
 * auth.refresh (architecture/03), espace auth : rotation du jeton de renouvellement. Chaque appel révoque la session
 * présentée et en ouvre une nouvelle dans la même famille, avec la même échéance (30 jours au plus après la connexion,
 * jamais prolongés) et le même « rester connecté ». Jeton déjà révoqué
 * = vol présumé : toute la famille est révoquée (`session_revoked`). Deux renouvellements simultanés du même jeton
 * sont sérialisés (verrou de la famille) : le second est une réutilisation. Le front n'en lance qu'un à la fois, tous onglets
 * confondus.
 */
@Injectable()
export class RefreshSessionUseCase {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly families: SessionFamilies,
    private readonly revoked: RevokedSessions,
    private readonly spaceAccess: SpaceAccess,
  ) {}

  async execute(token: string | undefined, now = new Date()): Promise<OpenedSession | AfterCommit<never>> {
    if (!token) throw new DomainProblem('session_expired');
    const tx = currentTx();
    const tokenHash = hashRefreshToken(token);
    const [found] = await tx
      .select({ familyId: sessions.familyId })
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .limit(1);
    if (!found) throw new DomainProblem('session_expired');
    // Verrou de la famille AVANT toute ligne (même ordre que les révocations : jamais d'interblocage), puis relecture :
    // deux renouvellements simultanés du même jeton sont sérialisés, le second voit le jeton révoqué.
    await this.families.lock(found.familyId);
    const [session] = await tx
      .select({
        id: sessions.id,
        userId: sessions.userId,
        familyId: sessions.familyId,
        space: sessions.space,
        expiresAt: sessions.expiresAt,
        revokedAt: sessions.revokedAt,
        rememberMe: sessions.rememberMe,
        userStatus: users.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.refreshTokenHash, tokenHash))
      .limit(1);
    if (!session) throw new DomainProblem('session_expired');

    // Réutilisation d'un jeton révoqué, compte qui n'est plus actif, ou espace qui n'est plus accessible (personnel
    // retiré, adresse hors liste) : la connexion entière est fermée. Révocation validée, puis liste noire, puis erreur.
    if (
      session.revokedAt !== null ||
      session.userStatus !== 'active' ||
      !(await this.spaceAccess.allows(session.userId, session.space))
    ) {
      const blacklist = await this.families.revoke(session.familyId, now);
      return afterCommit(async () => {
        await this.revoked.revoke(blacklist);
        throw new DomainProblem('session_revoked');
      });
    }
    if (session.expiresAt <= now) throw new DomainProblem('session_expired');

    await tx.update(sessions).set({ revokedAt: now, lastUsedAt: now }).where(eq(sessions.id, session.id));
    const request = currentRequestInfo();
    const sessionId = newId();
    const refresh = newRefreshToken();
    await tx.insert(sessions).values({
      id: sessionId,
      userId: session.userId,
      refreshTokenHash: refresh.hash,
      familyId: session.familyId,
      space: session.space,
      ip: request?.ip ? canonicalIp(request.ip) : null,
      userAgent: request?.userAgent?.slice(0, USER_AGENT_MAX) ?? null,
      // Échéance de la connexion recopiée : jamais prolongée par une rotation.
      expiresAt: session.expiresAt,
      rememberMe: session.rememberMe,
    });

    // `aid` des sessions d'association : lot 1.2 (aucune avant).
    const access = await this.signer.sign({ sub: session.userId, space: session.space, sid: sessionId }, now);
    return {
      accessToken: access.token,
      expiresAt: access.expiresAt,
      space: session.space,
      refreshToken: refresh.token,
      rememberMe: session.rememberMe,
      refreshMaxAgeMs: session.expiresAt.getTime() - now.getTime(),
    };
  }
}
