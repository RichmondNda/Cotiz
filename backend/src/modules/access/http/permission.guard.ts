import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setActorRole } from '../../../shared/request-info/index.js';
import { type AccessClaims, authenticatedSession } from '../../identity/identity.public.js';
import { actorRoleOf, holdsPermission } from '../domain/permission-policy.js';

/**
 * Rôle de l'acteur (actorRoleOf, le même calcul que `GET /me`). Lot 1.1, gardes sans accès base (décision du lot) :
 * rôles plateforme (`platform_staff`) et d'association (`memberships`) non lus, donc `null` et aucune permission de
 * rôle. ÉCART CONNU : `GET /me`, cas d'usage avec base, annonce déjà les permissions plateforme. Aucun endpoint
 * plateforme n'est livré avant le lot 1.2, qui lit ces rôles ici (`lookupAsSelf`) et referme l'écart.
 */
function roleOf(claims: AccessClaims): string | null {
  return actorRoleOf(claims.space, { platformRole: null, membershipRole: null });
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
