import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DomainProblem, routeAccess } from '../../../shared/http/index.js';
import { setRequestContext } from '../../../shared/tenant-context/index.js';
import { authenticatedSession } from '../../identity/identity.public.js';
import { SelfRoles } from '../application/self-roles.js';
import type { ManagementRole } from '../application/memberships.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const roles = new WeakMap<object, ManagementRole>();

/** Rôle de gestion vérifié par MembershipGuard pour cette requête (route d'association) ; `null` ailleurs. */
export function verifiedMembershipRole(request: object): ManagementRole | null {
  return roles.get(request) ?? null;
}

/**
 * Troisième garde globale (architecture/02, niveau 1). Le jeton association ne porte aucune association (lot 1.2,
 * choix Q1) : sur une route `/associations/{aid}/…`, le `{aid}` de l'URL est vérifié en base contre une appartenance
 * active owner, manager ou viewer de la personne du jeton ; alors seulement le contexte porte cette association. Sinon
 * (non-membre, souscripteur, invitée, retirée, aid invalide) : 404 `not_found`, comme une association inexistante.
 * Jeton association ailleurs (/me, routes communes) : la personne, sans association.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly selfRoles: SelfRoles,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const access = routeAccess(this.reflector, context);
    if (access.kind !== 'protected' || access.def.space === 'auth') return true;
    const request = context.switchToHttp().getRequest<{ params?: Record<string, string | undefined> }>();
    const claims = authenticatedSession(request);
    if (claims.space !== 'association') return true;

    if (access.def.space !== 'association') {
      setRequestContext(request, { space: 'association', userId: claims.sub });
      return true;
    }
    const raw = request.params?.aid;
    if (raw === undefined || !UUID.test(raw)) throw new DomainProblem('not_found');
    // Forme canonique : la casse de l'URL ne doit ni changer une clé (débit par association) ni fausser une comparaison.
    const aid = raw.toLowerCase();
    const role = await this.selfRoles.managementRole(claims.sub, aid);
    if (role === null) throw new DomainProblem('not_found');
    roles.set(request, role);
    setRequestContext(request, { space: 'association', associationId: aid, userId: claims.sub });
    return true;
  }
}
