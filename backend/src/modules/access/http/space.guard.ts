import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Space as ContractSpace } from '@cotiz/contracts';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setRequestContext } from '../../../shared/tenant-context/index.js';
import { markPlatformRoute } from '../../../shared/tenant-context/platform-route.js';
import { type AccessClaims, authenticatedSession } from '../../identity/identity.public.js';

/**
 * Espace de la route (endpoints.yaml) ↔ espace du jeton : `platform` et `association` exigent un jeton du même espace
 * (un jeton platform ne passe jamais sur /associations/*) ; `me`, `common` et `auth` acceptent tout espace (la
 * permission tranche ensuite). Ailleurs : jamais.
 */
export function spaceAccepts(route: ContractSpace, token: AccessClaims['space']): boolean {
  if (route === 'platform' || route === 'association') return route === token;
  return route === 'me' || route === 'common' || route === 'auth';
}

/**
 * Routes ouvertes à une session restreinte à l'enrôlement du second facteur (claim `mfa: 'enroll'`, lot 4.7) : tout
 * l'espace auth (renouvellement, déconnexion ; auth.mfa est public) et `GET /me`. Ni profil ni mot de passe : l'identité
 * ne change pas avant la preuve du second facteur.
 */
const ENROLLMENT_ENDPOINTS: ReadonlySet<string> = new Set(['me']);

/**
 * Deuxième garde globale : espace du jeton accepté par la route, sinon 404 `not_found` (comme une ressource
 * inexistante : rien n'est révélé). Session plateforme sans second facteur (claim `mfa: 'enroll'`) : seulement les
 * routes d'enrôlement, sinon 403 `forbidden` (lot 4.7 ; remplace la liste d'adresses de la V1). Pose le contexte tenant des jetons platform et subscriber ; celui d'un jeton association est posé
 * par MembershipGuard, après vérification de l'appartenance. Route /platform : connexion plateforme (markPlatformRoute).
 */
@Injectable()
export class SpaceGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected') return true;
    const request = context.switchToHttp().getRequest<object>();
    const claims = authenticatedSession(request);

    if (!spaceAccepts(access.def.space, claims.space)) throw new DomainProblem('not_found');
    // Se déconnecter et renouveler (espace auth) restent toujours possibles.
    if (claims.mfa === 'enroll' && access.def.space !== 'auth' && !ENROLLMENT_ENDPOINTS.has(access.def.id)) {
      throw new DomainProblem('forbidden');
    }
    if (access.def.space !== 'auth' && claims.space !== 'association') {
      setRequestContext(request, { space: claims.space, userId: claims.sub });
    }
    // Connexion cotiz_platform (BYPASSRLS) : routes /platform du contrat seulement, jamais d'après le seul jeton.
    if (access.def.space === 'platform') markPlatformRoute(request);
    return true;
  }
}
