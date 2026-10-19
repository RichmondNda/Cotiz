import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { authenticatedSession } from '../../identity/identity.public.js';

/**
 * Troisième garde globale (architecture/02, niveau 1) : un jeton association n'ouvre une association qu'avec une
 * appartenance active (`memberships`), vérifiée en base ; alors seulement le contexte porte son `associationId`.
 * Lot 1.1 : coquille. Les appartenances arrivent au lot 1.2 (accès base par `lookupAsSelf`) : d'ici là, tout jeton
 * association est refusé en 404, comme une association dont on n'est pas membre. Jamais l'aid du jeton seul.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected' || access.def.space === 'auth') return true;
    const claims = authenticatedSession(context.switchToHttp().getRequest<object>());
    if (claims.space === 'association') throw new DomainProblem('not_found');
    return true;
  }
}
