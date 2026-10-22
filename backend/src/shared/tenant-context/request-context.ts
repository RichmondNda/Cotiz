import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { setLogIdentity } from '../logging/index.js';
import type { TenantContext } from './tenant-database.js';

const contexts = new WeakMap<object, TenantContext>();

/**
 * Posé par les gardes (authentification et appartenance, lots 1.1 et 1.2) avant l'intercepteur.
 * `associationId` ne vient jamais directement de `{aid}` : seulement après vérification de l'appartenance.
 */
export function setRequestContext(request: object, context: TenantContext): void {
  contexts.set(request, context);
  setLogIdentity({ userId: context.userId, associationId: context.associationId });
}

export function getRequestContext(request: object): TenantContext | null {
  return contexts.get(request) ?? null;
}

const platformRoutes = new WeakSet<object>();

/**
 * Route `/platform` du contrat, jeton plateforme vérifié : posé par SpaceGuard seulement. La transaction passe alors par
 * la connexion plateforme (BYPASSRLS) ; un jeton plateforme ailleurs (/me, routes communes) reste en cotiz_app.
 */
export function markPlatformRoute(request: object): void {
  platformRoutes.add(request);
}

export function isPlatformRoute(request: object): boolean {
  return platformRoutes.has(request);
}

export const WITHOUT_TENANT_CONTEXT = Symbol('withoutTenantContext');

/** Route sans accès aux données (sondes, documentation) : pas de transaction, `currentTx()` y lève une erreur. */
export const WithoutTenantContext = (): MethodDecorator & ClassDecorator => SetMetadata(WITHOUT_TENANT_CONTEXT, true);

/** Route marquée `@WithoutTenantContext()` (méthode ou classe). */
export function isWithoutTenantContext(reflector: Reflector, context: ExecutionContext): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(WITHOUT_TENANT_CONTEXT, [
      context.getHandler(),
      context.getClass(),
    ]) === true
  );
}
