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

    const request = context.switchToHttp().getRequest<BearerRequest>();
    const claims = await verifyBearer(request, this.signer, this.revoked);
    if (access.def.space === 'auth') setRequestContext(request, { space: 'auth', userId: claims.sub });
    return true;
  }
}

interface BearerRequest {
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Jeton d'accès de la requête vérifié (signature, claims, liste noire) et retenu pour `authenticatedSession()`. Absent
 * ou invalide : 401 `session_expired` ; session révoquée : 401 `session_revoked`.
 */
async function verifyBearer(
  request: BearerRequest,
  signer: AccessTokenSigner,
  revoked: RevokedSessions,
): Promise<VerifiedAccess> {
  const header = request.headers.authorization;
  const token = typeof header === 'string' ? /^Bearer ([^\s]+)$/i.exec(header)?.[1] : undefined;
  if (!token) throw new DomainProblem('session_expired');
  let claims: VerifiedAccess;
  try {
    claims = await signer.verify(token);
  } catch {
    throw new DomainProblem('session_expired');
  }
  if (await revoked.isRevoked(claims.sid)) throw new DomainProblem('session_revoked');
  sessions.set(request, claims);
  return claims;
}

/**
 * Garde de route des opérations publiques au contrat qui exigent pourtant la personne connectée : enrôlement du second
 * facteur (auth.mfa › enroll, confirm, lot 4.7 ; `permission: public` dans endpoints.yaml, car verify se fait sans
 * session). Jeton vérifié comme par JwtGuard, contexte auth de la personne (lecture « de soi », audit).
 */
@Injectable()
export class BearerSessionGuard implements CanActivate {
  constructor(
    private readonly signer: AccessTokenSigner,
    private readonly revoked: RevokedSessions,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<BearerRequest>();
    const claims = await verifyBearer(request, this.signer, this.revoked);
    setRequestContext(request, { space: 'auth', userId: claims.sub });
    return true;
  }
}
