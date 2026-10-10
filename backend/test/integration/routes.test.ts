import type { INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { Module, RequestMethod } from '@nestjs/common';
import { DiscoveryModule, DiscoveryService, NestFactory } from '@nestjs/core';
import { ENDPOINTS, type EndpointDef } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { ApiDocsController } from '../../src/modules/docs/api-docs.controller.js';
import { endpointMetadata } from '../../src/shared/http/index.js';

/** Routes hors contrat : la documentation interne (jamais en production). */
const OUTSIDE_CONTRACT = new Set<unknown>([ApiDocsController]);

interface Route {
  controller: string;
  handler: string;
  method: string;
  path: string;
  endpoint: ReturnType<typeof endpointMetadata>;
}

const join = (...parts: (string | undefined)[]) =>
  `/${parts
    .flatMap((p) => (p ?? '').split('/'))
    .filter(Boolean)
    .join('/')}`;

describe('routes de l’api ↔ contrat (docs/specs/endpoints.yaml)', () => {
  let app: INestApplication;
  let routes: Route[];

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
    });
    @Module({ imports: [AppModule.register(config), DiscoveryModule] })
    class RoutesRoot {}
    app = await NestFactory.create(RoutesRoot, { logger: false });
    routes = [];
    for (const wrapper of app.get(DiscoveryService).getControllers()) {
      const controller = wrapper.metatype as (new () => object) | null;
      if (!controller || OUTSIDE_CONTRACT.has(controller)) continue;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | undefined;
      const proto = controller.prototype as Record<string, unknown>;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (path === undefined) continue;
        routes.push({
          controller: controller.name,
          handler: name,
          method: RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod],
          path: join('api/v1', base, path).replace(/:(\w+)/g, '{$1}'),
          endpoint: endpointMetadata(handler),
        });
      }
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('l’api expose des routes', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it('chaque route déclare son endpoint du contrat (@Endpoint)', () => {
    expect(routes.filter((r) => !r.endpoint).map((r) => `${r.controller}.${r.handler}`)).toEqual([]);
  });

  it('méthode et chemin de chaque route sont ceux de son opération dans le contrat', () => {
    const mismatches = routes.flatMap((r) => {
      if (!r.endpoint) return [];
      const operation = (ENDPOINTS[r.endpoint.id] as EndpointDef).operations[r.endpoint.operation];
      const actual = `${r.method} ${r.path}`;
      const expected = operation ? `${operation.method} ${operation.path}` : 'opération absente du contrat';
      return actual === expected ? [] : [`${r.endpoint.id}.${r.endpoint.operation} : ${actual} ≠ ${expected}`];
    });
    expect(mismatches).toEqual([]);
  });
});
