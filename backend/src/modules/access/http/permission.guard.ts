import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setActorRole } from '../../../shared/request-info/index.js';
import { authenticatedSession } from '../../identity/identity.public.js';
import { SelfRoles } from '../application/self-roles.js';
import { actorRoleOf, holdsPermission } from '../domain/permission-policy.js';
import { verifiedMembershipRole } from './membership.guard.js';

/**
 * Dernière garde globale (architecture/02, niveau 2) : la permission du contrat, déclarée par `@Can()` sur la route
 * (routeAccess refuse toute différence), évaluée contre docs/specs/permissions.yaml. Refus : 403 `forbidden`.
 * Rôle de l'acteur (actorRoleOf, le même calcul que `GET /me`) : rôle plateforme relu en base à chaque requête ; rôle
 * d'association vérifié par MembershipGuard (route d'association seulement ; ailleurs, aucun rôle d'association).
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly selfRoles: SelfRoles,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected') return true;
    const request = context.switchToHttp().getRequest<object>();
    const claims = authenticatedSession(request);
    const role = actorRoleOf(claims.space, {
      platformRole: claims.space === 'platform' ? await this.selfRoles.platformRole(claims.sub) : null,
      membershipRole: verifiedMembershipRole(request),
    });
    if (!holdsPermission(access.def.permission, { role })) throw new DomainProblem('forbidden');
    if (role) setActorRole(role);
    return true;
  }
}
