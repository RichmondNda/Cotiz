import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setRequestContext } from '../../../shared/tenant-context/index.js';
import { type VerifiedAccess, AccessTokenSigner } from '../infra/access-token-signer.js';
import { RevokedSessions } from '../infra/revoked-sessions.js';

const sessions = new WeakMap<object, VerifiedAccess>();

/** Claims du jeton d'accès vérifié par JwtGuard pour cette requête. */
export function authenticatedSession(request: object): VerifiedAccess {
  const claims = sessions.get(request);
  if (!claims) throw new Error('authenticatedSession() sur une route sans jeton vérifié par JwtGuard');
  return claims;
}

/**
 * Première garde globale (architecture/02) : toute route du contrat dont la permission n'est pas `public` exige un
 * jeton d'accès (`Authorization: Bearer <JWT>`) : signature EdDSA, émetteur, audience, expiration et forme des claims,
 * puis liste noire des sessions révoquées. Absent ou invalide : 401 `session_expired` ; session révoquée : 401
 * `session_revoked`. Route hors contrat : ouverte seulement sans accès aux données (routeAccess).
 * Contexte tenant : posé ici pour l'espace auth seulement (auth.logout) ; les autres par SpaceGuard et
 * MembershipGuard. Jamais l'association du jeton sans vérification de l'appartenance.
 */
@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly revoked: RevokedSessions,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected') return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const header = request.headers.authorization;
    const token = typeof header === 'string' ? /^Bearer ([^\s]+)$/i.exec(header)?.[1] : undefined;
    if (!token) throw new DomainProblem('session_expired');

    let claims: VerifiedAccess;
    try {
      claims = await this.signer.verify(token);
    } catch {
      throw new DomainProblem('session_expired');
    }
    if (await this.revoked.isRevoked(claims.sid)) throw new DomainProblem('session_revoked');

    sessions.set(request, claims);
    if (access.def.space === 'auth') setRequestContext(request, { space: 'auth', userId: claims.sub });
    return true;
  }
}
