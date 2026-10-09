import { SetMetadata } from '@nestjs/common';
import type { TenantContext } from './tenant-database.js';

const contexts = new WeakMap<object, TenantContext>();

/**
 * Posé par les gardes (authentification et appartenance, lots 1.1 et 1.2) avant l'intercepteur.
 * `associationId` ne vient jamais directement de `{aid}` : seulement après vérification de l'appartenance.
 */
export function setRequestContext(request: object, context: TenantContext): void {
  contexts.set(request, context);
}

export function getRequestContext(request: object): TenantContext | null {
  return contexts.get(request) ?? null;
}

export const WITHOUT_TENANT_CONTEXT = Symbol('withoutTenantContext');

/** Route sans accès aux données (sondes, documentation) : pas de transaction, `currentTx()` y lève une erreur. */
export const WithoutTenantContext = (): MethodDecorator & ClassDecorator => SetMetadata(WITHOUT_TENANT_CONTEXT, true);
