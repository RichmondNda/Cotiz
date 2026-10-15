import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setActorRole } from '../../../shared/request-info/index.js';
import { type AccessClaims, authenticatedSession } from '../../identity/identity.public.js';
import { holdsPermission } from '../domain/permission-policy.js';

/**
 * Rôle de l'acteur pour la matrice de permissions. Lot 1.1, sans accès base dans les gardes : le souscripteur
 * seulement. Rôles plateforme (`platform_staff`) et d'association (`memberships`) : lot 1.2 (`lookupAsSelf`) ; d'ici
 * là `null`, donc aucune permission de rôle (aucun endpoint de ces espaces n'est livré avant).
 */
function roleOf(claims: AccessClaims): string | null {
  return claims.space === 'subscriber' ? 'subscriber' : null;
}

/**
 * Dernière garde globale (architecture/02, niveau 2) : la permission du contrat, déclarée par `@Can()` sur la route
 * (routeAccess refuse toute différence), évaluée contre docs/specs/permissions.yaml. Refus : 403 `forbidden`.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected') return true;
    const role = roleOf(authenticatedSession(context.switchToHttp().getRequest<object>()));
    if (!holdsPermission(access.def.permission, { role })) throw new DomainProblem('forbidden');
    if (role) setActorRole(role);
    return true;
  }
}
