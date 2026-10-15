import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { EndpointDef, Permission } from '@cotiz/contracts';
import { isWithoutTenantContext } from '../tenant-context/index.js';
import { endpointOf } from './endpoint.js';

const CAN_METADATA = Symbol('can');

/**
 * Permission de la route, exactement celle de son endpoint dans docs/specs/endpoints.yaml (vérifié par PermissionGuard
 * et test/integration/routes.test.ts). Lisible dans le contrôleur ; la barrière est la garde.
 */
export const Can = (permission: Permission) => SetMetadata(CAN_METADATA, permission);

/** Permission déclarée par `@Can()` sur une méthode de route (tests de conformité). */
export function canMetadata(handler: object): Permission | undefined {
  return Reflect.getMetadata(CAN_METADATA, handler) as Permission | undefined;
}

/**
 * Accès d'une route, vu par les gardes d'authentification :
 * - `public` : permission `public` du contrat, aucune authentification ;
 * - `protected` : toute autre permission du contrat, jeton d'accès exigé ;
 * - `outside` : route hors contrat sans accès aux données (`@WithoutTenantContext()` : documentation, démonstration).
 * Une route hors contrat qui accède aux données est une erreur de configuration : refusée (500), jamais ouverte.
 */
export type RouteAccess =
  { kind: 'public'; def: EndpointDef } | { kind: 'protected'; def: EndpointDef } | { kind: 'outside' };

export function routeAccess(reflector: Reflector, context: ExecutionContext): RouteAccess {
  const endpoint = endpointOf(reflector, context);
  if (!endpoint) {
    if (isWithoutTenantContext(reflector, context)) return { kind: 'outside' };
    throw new Error('route hors contrat avec accès aux données : déclarer @Endpoint() (docs/specs/endpoints.yaml)');
  }
  const declared = reflector.get<Permission | undefined>(CAN_METADATA, context.getHandler());
  if (declared !== endpoint.def.permission) {
    throw new Error(`@Can('${declared ?? '?'}') différent de la permission du contrat pour ${endpoint.id}`);
  }
  return endpoint.def.permission === 'public'
    ? { kind: 'public', def: endpoint.def }
    : { kind: 'protected', def: endpoint.def };
}
