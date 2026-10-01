import { createDocument } from 'zod-openapi';
import type { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';
import { z } from 'zod';
import { Problem } from './common/problem.js';
import { ENDPOINTS } from './endpoints/index.js';
import type { EndpointDef, OperationDef } from './registry.js';

// Document OpenAPI 3.1 généré depuis le registre : jamais écrit à la main (architecture/06-api-conventions.md).

const IdempotencyKey = z.string().min(8).max(128).meta({ description: 'Identifiant unique de l’opération (UUID).' });
const IfMatch = z.string().meta({ description: 'ETag de la ressource lue (`W/"<version>"`).' });

function operation(def: EndpointDef, name: string, op: OperationDef): ZodOpenApiOperationObject {
  const writes = op.method !== 'GET';
  const headers: Record<string, z.ZodType> = {};
  if (writes && def.flags.idempotencyKey) headers['Idempotency-Key'] = IdempotencyKey;
  if (writes && def.flags.ifMatch) headers['If-Match'] = IfMatch;

  const contentType = op.response.contentType ?? 'application/json';
  const success = {
    description: op.response.status === 302 ? 'Redirection vers une URL signée' : 'Succès',
    ...(op.response.body ? { content: { [contentType]: { schema: op.response.body } } } : {}),
  };

  return {
    operationId: `${def.id}.${name}`,
    summary: `${def.id} · ${name}`,
    tags: [def.space],
    'x-endpoint-id': def.id,
    'x-permission': def.permission,
    'x-errors': [...def.errors],
    'x-rate-limited': def.flags.rateLimited,
    'x-audited': def.flags.audited,
    requestParams: {
      ...(op.request.params ? { path: op.request.params } : {}),
      ...(op.request.query ? { query: op.request.query } : {}),
      ...(Object.keys(headers).length ? { header: z.object(headers) } : {}),
    },
    ...(op.request.body
      ? { requestBody: { required: true, content: { 'application/json': { schema: op.request.body } } } }
      : {}),
    responses: {
      [String(op.response.status)]: success,
      default: { description: 'Erreur', content: { 'application/problem+json': { schema: Problem } } },
    },
  };
}

export function buildOpenApi(): ReturnType<typeof createDocument> {
  const paths: ZodOpenApiPathsObject = {};
  for (const def of Object.values(ENDPOINTS) as EndpointDef[]) {
    for (const [name, op] of Object.entries(def.operations)) {
      const item = (paths[op.path] ??= {});
      (item as Record<string, ZodOpenApiOperationObject>)[op.method.toLowerCase()] = operation(def, name, op);
    }
  }
  return createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Cotiz API',
      version: '1.0.0',
      description: 'Contrat généré depuis @cotiz/contracts (docs/specs/endpoints.yaml). Montants : entiers + devise.',
    },
    servers: [{ url: '/' }],
    paths,
  });
}
