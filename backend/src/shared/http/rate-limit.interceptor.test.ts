import { Reflector } from '@nestjs/core';
import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { runWithRequestInfo } from '../request-info/index.js';
import { setRequestContext } from '../tenant-context/index.js';
import { DomainProblem } from './domain-problem.js';
import { Endpoint } from './endpoint.js';
import { type CounterStore, RateLimitInterceptor } from './rate-limit.interceptor.js';
import { type FakeRequest, FakeResponse, fakeHandler, httpContext, routeHandler } from './testing.js';

class Routes {
  @Endpoint('fl.upload', 'create')
  upload(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  @Endpoint('as.get', 'get')
  read(): void {
    // Route de test : seules ses métadonnées comptent.
  }

  outside(): void {
    // Route de test : seules ses métadonnées comptent.
  }
}

/** Compteurs en mémoire, fenêtre fixe. */
class MemoryCounters implements CounterStore {
  counts = new Map<string, number>();
  failing = false;
  hit(key: string): Promise<{ count: number; resetSeconds: number }> {
    if (this.failing) return Promise.reject(new Error('redis indisponible'));
    const count = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, count);
    return Promise.resolve({ count, resetSeconds: 42 });
  }
}

const A = '00000000-0000-7000-8000-00000000a001';
const AWA = '00000000-0000-7000-8000-000000000001';
const MOUSSA = '00000000-0000-7000-8000-000000000002';

const config = loadConfig({
  DATABASE_URL: 'postgres://x:y@localhost:5432/z',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  RATE_LIMIT_ASSOCIATION_PER_MIN: '4',
  RATE_LIMIT_ENDPOINT_PER_MIN: '2',
});

function setup() {
  const counters = new MemoryCounters();
  const interceptor = new RateLimitInterceptor(new Reflector(), counters, config);
  /** Une requête ; renvoie la réponse, ou l'erreur levée. */
  const request = async (
    route: keyof Routes,
    who: { ip?: string; userId?: string; associationId?: string } = {},
  ): Promise<{ response: FakeResponse; error?: unknown; handled: boolean }> => {
    const req: FakeRequest = { method: 'POST', url: '/x', headers: {} };
    if (who.userId) {
      setRequestContext(
        req,
        who.associationId
          ? { space: 'association', associationId: who.associationId, userId: who.userId }
          : { space: 'subscriber', userId: who.userId },
      );
    }
    const response = new FakeResponse();
    const handler = fakeHandler();
    const context = httpContext(routeHandler(Routes, route), Routes, req, response);
    try {
      await runWithRequestInfo({ requestId: 'r', ip: who.ip ?? '203.0.113.7', userAgent: null }, async () =>
        lastValueFrom(await interceptor.intercept(context, handler)),
      );
      return { response, handled: handler.calls === 1 };
    } catch (error) {
      return { response, error, handled: handler.calls === 1 };
    }
  };
  return { counters, request };
}

const code = (error: unknown) => (error instanceof DomainProblem ? error.code : undefined);

describe('RateLimitInterceptor (fenêtre d’une minute, Redis)', () => {
  it('par association : toutes ses requêtes comptent ensemble, quel que soit l’utilisateur', async () => {
    const { request } = setup();
    for (let i = 0; i < 4; i++) {
      expect((await request('read', { userId: i % 2 ? AWA : MOUSSA, associationId: A })).handled).toBe(true);
    }
    const fifth = await request('read', { userId: MOUSSA, associationId: A });
    expect(fifth.handled).toBe(false);
    expect(code(fifth.error)).toBe('too_many_requests');
    expect(fifth.response.getHeader('retry-after')).toBe('42');
  });

  it('endpoint à débit limité (rateLimited) : par utilisateur, quelle que soit l’IP', async () => {
    const { request } = setup();
    expect((await request('upload', { userId: MOUSSA, ip: '198.51.100.1' })).handled).toBe(true);
    expect((await request('upload', { userId: MOUSSA, ip: '198.51.100.2' })).handled).toBe(true);
    expect(code((await request('upload', { userId: MOUSSA, ip: '198.51.100.3' })).error)).toBe('too_many_requests');
    // Un autre utilisateur garde son propre quota.
    expect((await request('upload', { userId: AWA, ip: '198.51.100.4' })).handled).toBe(true);
  });

  it('endpoint à débit limité, sans utilisateur : quota par IP', async () => {
    const { request } = setup();
    await request('upload');
    await request('upload');
    expect(code((await request('upload')).error)).toBe('too_many_requests');
  });

  it('le plafond par IP n’est pas compté ici (middleware, avant les gardes)', async () => {
    const { request, counters } = setup();
    await request('read', { userId: AWA, associationId: A });
    await request('outside');
    expect([...counters.counts.keys()]).toEqual([`aid:${A}`]);
  });

  it('Redis indisponible, endpoint ordinaire : la requête passe', async () => {
    const { request, counters } = setup();
    counters.failing = true;
    expect((await request('read', { userId: AWA, associationId: A })).handled).toBe(true);
  });

  it('Redis indisponible, endpoint rateLimited : refusé (jamais d’essais illimités), Retry-After court', async () => {
    const { request, counters } = setup();
    counters.failing = true;
    const res = await request('upload', { userId: MOUSSA });
    expect(res.handled).toBe(false);
    expect(code(res.error)).toBe('too_many_requests');
    expect(res.response.getHeader('retry-after')).toBe('30');
  });
});
