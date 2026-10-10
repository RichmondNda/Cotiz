import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ENDPOINTS, ERROR_CODES } from './index.js';
import type { EndpointDef } from './index.js';
import { buildOpenApi } from './openapi.js';

const committed = JSON.parse(
  readFileSync(fileURLToPath(new URL('../openapi.json', import.meta.url)), 'utf8'),
) as unknown;
const doc = buildOpenApi();
type Operation = Record<string, unknown> & { parameters?: { name: string; in: string; required?: boolean }[] };
const op = (path: string, method: string) => (doc.paths?.[path] as Record<string, Operation> | undefined)?.[method];

describe('OpenAPI 3.1 généré depuis le registre', () => {
  it('openapi.json est à jour (pnpm --filter contracts openapi)', () => {
    expect(committed).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it('Problem.code : énumération extensible (un nouveau code d’erreur n’est pas un changement cassant)', () => {
    const problem = (doc.components?.schemas as Record<string, { properties: Record<string, Record<string, unknown>> }>)
      .Problem;
    expect(problem?.properties.code).toEqual({ type: 'string', 'x-extensible-enum': [...ERROR_CODES] });
    // Nulle part le catalogue en `enum` fermé (ex. codes d'erreur par ligne d'un import).
    const closed = JSON.stringify(doc).match(/"enum":\["internal_error"/g);
    expect(closed).toBeNull();
  });

  it('une opération par opération du registre, avec un operationId stable', () => {
    const expected = (Object.values(ENDPOINTS) as EndpointDef[]).flatMap((e) =>
      Object.entries(e.operations).map(([name, o]) => [`${o.method.toLowerCase()} ${o.path}`, `${e.id}.${name}`]),
    );
    const actual = Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
      Object.entries(item as Record<string, Operation>).map(([method, o]) => [`${method} ${path}`, o.operationId]),
    );
    expect(actual.sort()).toEqual(expected.sort());
  });

  it('en-têtes Idempotency-Key et If-Match exigés selon les drapeaux', () => {
    const validate = op('/api/v1/associations/{aid}/payments/{payId}/validate', 'post');
    const headers = (validate?.parameters ?? []).filter((p) => p.in === 'header');
    expect(headers.map((h) => [h.name, h.required])).toEqual([
      ['Idempotency-Key', true],
      ['If-Match', true],
    ]);
    const list = op('/api/v1/associations/{aid}/payments', 'get');
    expect((list?.parameters ?? []).filter((p) => p.in === 'header')).toEqual([]);
  });

  it('permission, erreurs métier et Problem (RFC 9457) documentés', () => {
    const validate = op('/api/v1/associations/{aid}/payments/{payId}/validate', 'post');
    expect(validate?.['x-permission']).toBe('payments.review');
    expect(validate?.['x-errors']).toContain('allocation_mismatch');
    const responses = validate?.responses as Record<string, { content?: Record<string, unknown> }>;
    expect(Object.keys(responses.default?.content ?? {})).toEqual(['application/problem+json']);
  });

  it('les montants sont des entiers, jamais des nombres décimaux', () => {
    const money = doc.components?.schemas?.Money as { properties: { amount: { type: string } } };
    expect(money.properties.amount.type).toBe('integer');
  });
});
