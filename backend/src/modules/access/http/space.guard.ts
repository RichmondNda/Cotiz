import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Space as ContractSpace } from '@cotiz/contracts';
import { CONFIG, type Config } from '../../../config.js';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { parseIpAllowList } from '../../../shared/net/index.js';
import { currentRequestInfo } from '../../../shared/request-info/index.js';
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
 * Deuxième garde globale : espace du jeton accepté par la route, sinon 404 `not_found` (comme une ressource
 * inexistante : rien n'est révélé). Jeton platform : adresse du client dans PLATFORM_ALLOWED_IPS à chaque requête
 * (403 `forbidden`), sauf dans l'espace auth (déconnexion). Pose le contexte tenant des jetons platform et subscriber ; celui d'un jeton association est posé
 * par MembershipGuard, après vérification de l'appartenance. Route /platform : connexion plateforme (markPlatformRoute).
 */
@Injectable()
export class SpaceGuard implements CanActivate {
  private readonly platformIpAllowed: ((ip: string | null) => boolean) | null;

  constructor(
    private readonly reflector: Reflector,
    @Inject(CONFIG) config: Config,
  ) {
    this.platformIpAllowed =
      config.PLATFORM_ALLOWED_IPS === undefined ? null : parseIpAllowList(config.PLATFORM_ALLOWED_IPS);
  }

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected') return true;
    const request = context.switchToHttp().getRequest<object>();
    const claims = authenticatedSession(request);

    // Jamais pour l'espace auth : se déconnecter (révoquer) reste possible depuis toute adresse.
    if (
      claims.space === 'platform' &&
      access.def.space !== 'auth' &&
      this.platformIpAllowed &&
      !this.platformIpAllowed(currentRequestInfo()?.ip ?? null)
    ) {
      throw new DomainProblem('forbidden');
    }
    if (!spaceAccepts(access.def.space, claims.space)) throw new DomainProblem('not_found');
    if (access.def.space !== 'auth' && claims.space !== 'association') {
      setRequestContext(request, { space: claims.space, userId: claims.sub });
    }
    // Connexion cotiz_platform (BYPASSRLS) : routes /platform du contrat seulement, jamais d'après le seul jeton.
    if (access.def.space === 'platform') markPlatformRoute(request);
    return true;
  }
}
