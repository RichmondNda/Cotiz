import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ENDPOINTS, requiresIfMatch } from './index.js';
import type { EndpointDef } from './index.js';

// Le registre doit être identique à docs/specs/endpoints.yaml : ids, espace, permission, erreurs, drapeaux,
// méthodes et chemins. Les schémas, eux, viennent des écrans (docs/ui/) et de schema.sql.

interface YamlEndpoint {
  id: string;
  space: string;
  permission: string;
  operations: { method: string; path: string }[];
  errors: string[];
  idempotencyKey: boolean;
  ifMatch: boolean;
  rateLimited: boolean;
  audited: boolean;
}

const yamlFile = fileURLToPath(new URL('../../../docs/specs/endpoints.yaml', import.meta.url));
const { endpoints } = parse(readFileSync(yamlFile, 'utf8')) as { endpoints: YamlEndpoint[] };
const yamlById = new Map(endpoints.map((e) => [e.id, e]));
const registry = Object.values(ENDPOINTS) as EndpointDef[];

const opKey = (o: { method: string; path: string }) => `${o.method} ${o.path}`;
const placeholders = (path: string) => [...path.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('registre des endpoints', () => {
  it('If-Match : exigé pour les écritures d’un endpoint ifMatch, sauf exception déclarée et lecture', () => {
    const { pfPlanWrite, ctGet, lgPayValidate } = {
      pfPlanWrite: ENDPOINTS['pf.plan.write'] as EndpointDef,
      ctGet: ENDPOINTS['ct.get'] as EndpointDef,
      lgPayValidate: ENDPOINTS['lg.pay.validate'] as EndpointDef,
    };
    const ops = (def: EndpointDef) =>
      Object.fromEntries(Object.entries(def.operations).map(([name, op]) => [name, requiresIfMatch(def, op)]));
    expect(ops(pfPlanWrite)).toEqual({ create: false, patch: true });
    expect(ops(ctGet)).toMatchObject({ get: false });
    expect(Object.values(ops(lgPayValidate))).toEqual([true]);
  });

  it(`les ${String(endpoints.length)} ids de endpoints.yaml sont tous dans le registre, aucun en trop`, () => {
    expect(registry.map((e) => e.id).sort()).toEqual(endpoints.map((e) => e.id).sort());
  });

  it('les clés du registre sont les ids', () => {
    for (const [key, def] of Object.entries(ENDPOINTS)) expect(def.id).toBe(key);
  });

  describe.each(registry.map((def) => [def.id, def] as const))('%s', (id, def) => {
    const spec = yamlById.get(id);

    it('espace, permission, erreurs et drapeaux de endpoints.yaml', () => {
      expect(spec).toBeDefined();
      if (!spec) return;
      expect(def.space).toBe(spec.space);
      expect(def.permission).toBe(spec.permission);
      expect([...def.errors]).toEqual(spec.errors);
      expect(def.flags).toEqual({
        idempotencyKey: spec.idempotencyKey,
        ifMatch: spec.ifMatch,
        rateLimited: spec.rateLimited,
        audited: spec.audited,
      });
    });

    it('mêmes opérations (méthode et chemin)', () => {
      const ops = Object.values(def.operations);
      expect(ops.map(opKey).sort()).toEqual((spec?.operations ?? []).map(opKey).sort());
    });

    it('exception If-Match (`ifMatch: false`) : seulement une création (201) d’un endpoint qui porte ifMatch', () => {
      for (const op of Object.values(def.operations)) {
        if (op.ifMatch === false)
          expect({ flag: def.flags.ifMatch, status: op.response.status, method: op.method }).toEqual({
            flag: true,
            status: 201,
            method: 'POST',
          });
      }
    });

    it.each(Object.entries(def.operations))('%s : paramètres de chemin, corps et réponse cohérents', (_name, op) => {
      const params = op.request.params ? Object.keys(op.request.params.shape).sort() : [];
      expect(params).toEqual(placeholders(op.path));
      if (op.method === 'GET') expect(op.request.body).toBeUndefined();
      if (op.response.status === 204 || op.response.status === 302) expect(op.response.body).toBeUndefined();
      // 202 : accusé de réception, avec ou sans corps.
      else if (op.response.status !== 202) expect(op.response.body).toBeInstanceOf(z.ZodType);
    });
  });
});
