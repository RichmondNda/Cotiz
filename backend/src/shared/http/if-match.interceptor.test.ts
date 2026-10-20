import { Reflector } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { runWithRequestInfo } from '../request-info/index.js';
import { DomainProblem } from './domain-problem.js';
import { Endpoint } from './endpoint.js';
import { expectedVersion, IfMatchInterceptor } from './if-match.interceptor.js';
import { FakeResponse, fakeHandler, httpContext, routeHandler } from './testing.js';

class Routes {
  @Endpoint('as.patch', 'patch')
  patch(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('as.get', 'get')
  read(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('pf.plan.write', 'create')
  create(): void {
    // Route de test : création (201) d'un endpoint qui porte ifMatch.
  }

  @Endpoint('ct.get', 'get')
  contract(): void {
    // Route de test : lecture (GET) d'un endpoint qui porte ifMatch.
  }

  @Endpoint('pf.plan.write', 'patch')
  planPatch(): void {
    // Route de test : modification d'un endpoint qui porte ifMatch.
  }

  @Endpoint('lg.pay.validate', 'validate')
  validate(): void {
    // Route de test : POST (200) d'un endpoint qui porte ifMatch, sur une ressource existante.
  }

  @Endpoint('ct.get', 'lock')
  lock(): void {
    // Route de test : POST d'action d'un endpoint qui porte ifMatch.
  }

  @Endpoint('pf.plan.write', 'pas-une-operation' as 'patch')
  unknown(): void {
    // Route de test : opération absente du contrat.
  }
}

async function call(
  route: Exclude<keyof Routes, 'constructor'>,
  ifMatch: string | undefined,
  result: unknown = { id: 'a', version: 4 },
) {
  const interceptor = new IfMatchInterceptor(new Reflector());
  const req = { method: 'PATCH', url: '/x', headers: { 'if-match': ifMatch } };
  const response = new FakeResponse();
  let seen: number | undefined;
  const handler = {
    calls: 0,
    handle: () => {
      handler.calls++;
      seen = route === 'patch' ? expectedVersion() : undefined;
      return fakeHandler(result).handle();
    },
  };
  try {
    const value = await runWithRequestInfo({ requestId: 'r', ip: null, userAgent: null }, async () =>
      lastValueFrom(interceptor.intercept(httpContext(routeHandler(Routes, route), Routes, req, response), handler)),
    );
    return { value, response, seen, calls: handler.calls };
  } catch (error) {
    return { error, response, seen, calls: handler.calls };
  }
}

describe('IfMatchInterceptor (If-Match exigé, ETag en réponse)', () => {
  it('ifMatch ne s’applique ni à une création (201) ni à une lecture (GET) du même endpoint', async () => {
    expect((await call('create', undefined)).calls).toBe(1);
    expect((await call('contract', undefined)).calls).toBe(1);
    for (const route of ['planPatch', 'validate', 'lock'] as const) {
      const refused = await call(route, undefined);
      expect({ route, calls: refused.calls }).toEqual({ route, calls: 0 });
      expect(refused.error).toBeInstanceOf(DomainProblem);
    }
  });

  it('opération inconnue du contrat : erreur de configuration, jamais sans If-Match', async () => {
    const res = await call('unknown', undefined);
    expect(res.calls).toBe(0);
    expect((res.error as Error).message).toMatch(/opération inconnue/);
  });

  it.each([
    ['W/"3"', 3],
    ['"3"', 3],
    ['3', 3],
    ['W/"0"', 0],
  ])('If-Match %s → version attendue %i, transmise au cas d’usage', async (header, version) => {
    const res = await call('patch', header);
    expect(res.seen).toBe(version);
  });

  it('ETag W/"<version>" sur une réponse qui porte une version', async () => {
    const res = await call('read', undefined, { id: 'a', version: 7 });
    expect(res.response.getHeader('etag')).toBe('W/"7"');
  });

  it('pas d’ETag sans version entière', async () => {
    expect((await call('read', undefined, { id: 'a' })).response.getHeader('etag')).toBeUndefined();
    expect((await call('read', undefined, { version: '7' })).response.getHeader('etag')).toBeUndefined();
    expect((await call('read', undefined, [{ version: 1 }])).response.getHeader('etag')).toBeUndefined();
  });

  it.each([
    ['absent', undefined, 'required'],
    ['illisible', 'W/"abc"', 'invalid'],
    ['plusieurs versions', 'W/"1", W/"2"', 'invalid'],
    ['joker', '*', 'invalid'],
  ])('If-Match %s sur un endpoint qui l’exige → 422 validation_failed, sans exécution', async (_case, header, rule) => {
    const res = await call('patch', header);
    expect(res.error).toBeInstanceOf(DomainProblem);
    expect((res.error as DomainProblem).details.fields).toEqual({ 'If-Match': rule });
    expect(res.calls).toBe(0);
  });

  it('endpoint sans le drapeau : If-Match ignoré, expectedVersion() refusé au cas d’usage', async () => {
    const res = await call('read', undefined);
    expect(res.calls).toBe(1);
    expect(() => runWithRequestInfo({ requestId: 'r', ip: null, userAgent: null }, () => expectedVersion())).toThrow(
      /If-Match/,
    );
  });
});
