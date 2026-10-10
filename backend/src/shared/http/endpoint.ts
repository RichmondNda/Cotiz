import { type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { ENDPOINTS, type EndpointDef, type EndpointId } from '@cotiz/contracts';

const ENDPOINT_METADATA = Symbol('endpoint');

export interface EndpointRef {
  id: EndpointId;
  operation: string;
}

/**
 * Relie une route à son entrée du contrat (docs/specs/endpoints.yaml) : drapeaux `rateLimited`, `idempotencyKey`,
 * `ifMatch` appliqués par les intercepteurs. Un test vérifie que méthode et chemin sont ceux du contrat.
 */
export const Endpoint = <I extends EndpointId>(id: I, operation: keyof (typeof ENDPOINTS)[I]['operations'] & string) =>
  SetMetadata(ENDPOINT_METADATA, { id, operation } satisfies EndpointRef);

/** Endpoint de la route en cours et sa définition ; `null` pour une route hors contrat. */
export function endpointOf(
  reflector: Reflector,
  context: ExecutionContext,
): (EndpointRef & { def: EndpointDef }) | null {
  const ref = reflector.get<EndpointRef | undefined>(ENDPOINT_METADATA, context.getHandler());
  return ref ? { ...ref, def: ENDPOINTS[ref.id] } : null;
}

/** Métadonnée brute (test de conformité des routes au contrat). */
export function endpointMetadata(handler: object): EndpointRef | undefined {
  return Reflect.getMetadata(ENDPOINT_METADATA, handler) as EndpointRef | undefined;
}
