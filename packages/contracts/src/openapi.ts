import { createDocument } from 'zod-openapi';
import type { ZodOpenApiOperationObject, ZodOpenApiPathsObject } from 'zod-openapi';
import { z } from 'zod';
import { Problem } from './common/problem.js';
import { ERROR_CODES } from './generated/error-codes.js';
import { ENDPOINTS } from './endpoints/index.js';
import { type EndpointDef, type OperationDef, requiresIfMatch } from './registry.js';

// Document OpenAPI 3.1 généré depuis le registre : jamais écrit à la main (architecture/06-api-conventions.md).

const IdempotencyKey = z.string().min(8).max(128).meta({ description: 'Identifiant unique de l’opération (UUID).' });
const IfMatch = z.string().meta({ description: 'ETag de la ressource lue (`W/"<version>"`).' });

function operation(def: EndpointDef, name: string, op: OperationDef): ZodOpenApiOperationObject {
  const writes = op.method !== 'GET';
  const headers: Record<string, z.ZodType> = {};
  if (writes && def.flags.idempotencyKey) headers['Idempotency-Key'] = IdempotencyKey;
  if (requiresIfMatch(def, op)) headers['If-Match'] = IfMatch;

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

/**
 * Codes d'erreur en énumération extensible (`x-extensible-enum`), partout où le catalogue apparaît (`Problem.code`,
 * codes d'erreur par ligne…) : errors.yaml s'enrichit lot après lot ; un client doit traiter un code inconnu (message
 * générique), et oasdiff ne compte pas un nouveau code comme un changement cassant.
 */
function extensibleErrorCodes(node: unknown, catalog: ReadonlySet<string>): number {
  if (Array.isArray(node)) return node.reduce((n: number, item) => n + extensibleErrorCodes(item, catalog), 0);
  if (node === null || typeof node !== 'object') return 0;
  const record = node as Record<string, unknown>;
  let replaced = 0;
  const values = record.enum;
  if (Array.isArray(values) && values.length === catalog.size && values.every((v) => catalog.has(v as string))) {
    delete record.enum;
    record['x-extensible-enum'] = values;
    replaced++;
  }
  for (const value of Object.values(record)) replaced += extensibleErrorCodes(value, catalog);
  return replaced;
}

export function buildOpenApi(): ReturnType<typeof createDocument> {
  const paths: ZodOpenApiPathsObject = {};
  for (const def of Object.values(ENDPOINTS) as EndpointDef[]) {
    for (const [name, op] of Object.entries(def.operations)) {
      const item = (paths[op.path] ??= {});
      (item as Record<string, ZodOpenApiOperationObject>)[op.method.toLowerCase()] = operation(def, name, op);
    }
  }
  const document = createDocument({
    openapi: '3.1.0',
    info: {
      title: 'Cotiz API',
      version: '1.0.0',
      description: 'Contrat généré depuis @cotiz/contracts (docs/specs/endpoints.yaml). Montants : entiers + devise.',
    },
    servers: [{ url: '/' }],
    paths,
  });
  if (extensibleErrorCodes(document, new Set<string>(ERROR_CODES)) === 0) {
    throw new Error('openapi : aucune énumération des codes d’erreur trouvée');
  }
  return document;
}
