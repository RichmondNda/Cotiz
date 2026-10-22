import type { z } from 'zod';
import type { EndpointId } from './generated/endpoint-ids.js';
import type { ErrorCode } from './generated/error-codes.js';
import type { Permission } from './generated/permissions.js';

// Registre des endpoints : une entrée par id de docs/specs/endpoints.yaml.
// Un id regroupe une ou plusieurs opérations HTTP ; permission, erreurs et drapeaux sont portés par l'id.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Space = 'system' | 'common' | 'auth' | 'public' | 'platform' | 'association' | 'me';

export interface OperationDef {
  method: HttpMethod;
  /** Chemin complet, identique à endpoints.yaml (`/api/v1/associations/{aid}/projects`). */
  path: string;
  request: {
    /** Paramètres de chemin : exactement les `{…}` de `path`. */
    params?: z.ZodObject;
    query?: z.ZodObject;
    body?: z.ZodType;
  };
  /**
   * Exception au drapeau `ifMatch` de l'endpoint (porté par l'id dans endpoints.yaml) : `false` pour une opération qui
   * ne modifie pas une ressource existante, donc sans version à vérifier (création de pf.plan.write). Lot 1.2.
   */
  ifMatch?: false;
  response: {
    status: 200 | 201 | 202 | 204 | 302;
    /** Absent pour 204 et 302, facultatif pour 202. */
    body?: z.ZodType;
    /** `application/json` par défaut ; flux SSE pour les notifications. */
    contentType?: 'application/json' | 'text/event-stream';
  };
}

export interface EndpointDef {
  id: EndpointId;
  space: Space;
  permission: Permission;
  /** Erreurs métier de endpoints.yaml (les erreurs transverses ne sont pas répétées). */
  errors: readonly ErrorCode[];
  flags: {
    idempotencyKey: boolean;
    ifMatch: boolean;
    rateLimited: boolean;
    audited: boolean;
  };
  /** Opérations nommées (`list`, `get`, `create`…), appelées par ce nom dans le client. */
  operations: Readonly<Record<string, OperationDef>>;
}

/** Garde les types littéraux de la définition (utilisés par le client typé). */
export function defineEndpoint<const T extends EndpointDef>(def: T): T {
  return def;
}

/**
 * `If-Match` exigé pour cette opération : drapeau `ifMatch` de l'endpoint, sauf lecture (GET) et exception déclarée
 * par l'opération (`ifMatch: false`). Même règle pour le serveur, le client et l'OpenAPI.
 */
export function requiresIfMatch(def: Pick<EndpointDef, 'flags'>, op: OperationDef): boolean {
  return def.flags.ifMatch && op.method !== 'GET' && op.ifMatch !== false;
}

/** Drapeaux usuels, à compléter par endpoint. */
export const noFlags = { idempotencyKey: false, ifMatch: false, rateLimited: false, audited: false } as const;
