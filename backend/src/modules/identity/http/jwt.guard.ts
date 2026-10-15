import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, endpointOf } from '../../../shared/http/index.js';
import { setRequestContext } from '../../../shared/tenant-context/index.js';
import { type AccessClaims, AccessTokenSigner } from '../infra/access-token-signer.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';

const sessions = new WeakMap<object, AccessClaims>();

/** Claims du jeton d'accès vérifié par JwtGuard pour cette requête. */
export function authenticatedSession(request: object): AccessClaims {
  const claims = sessions.get(request);
  if (!claims) throw new Error('authenticatedSession() sans JwtGuard sur la route');
  return claims;
}

/**
 * Authentification par jeton d'accès (`Authorization: Bearer <JWT>`) : signature EdDSA, émetteur, audience,
 * expiration et forme des claims, puis liste noire des sessions révoquées. Absent ou invalide : 401
 * `session_expired` ; session révoquée : 401 `session_revoked`.
 * Contexte tenant : pour un endpoint de l'espace auth (auth.logout), espace auth et utilisateur du jeton. Jamais
 * l'association du jeton : `associationId` n'est posé qu'après vérification de l'appartenance (MembershipGuard).
 * Lot 1.1, étape 3 : sur auth.logout seulement ; l'étape 4 la rend globale (routes `public` ignorées) et confie
 * l'espace des autres routes à SpaceGuard et MembershipGuard.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly revoked: RevokedSessions,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? /^Bearer ([^\s]+)$/i.exec(header)?.[1] : undefined;
    if (!token) throw new DomainProblem('session_expired');

    let claims: AccessClaims;
    try {
      claims = await this.signer.verify(token);
    } catch {
      throw new DomainProblem('session_expired');
    }
    if (await this.revoked.isRevoked(claims.sid)) throw new DomainProblem('session_revoked');

    sessions.set(request, claims);
    if (endpointOf(this.reflector, context)?.def.space === 'auth') {
      setRequestContext(request, { space: 'auth', userId: claims.sub });
    }
    return true;
  }
}
