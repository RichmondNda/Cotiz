import { lastValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { DomainProblem } from '../../../shared/http/index.js';
import {
  type FakeRequest,
  FakeResponse,
  fakeHandler,
  httpContext,
  routeHandler,
} from '../../../shared/http/testing.js';
import type { RedisClient } from '../../../shared/redis/redis.module.js';
import { runWithRequestInfo } from '../../../shared/request-info/index.js';
import { SUBMISSIONS_PER_HOUR, SubmitThrottleInterceptor } from './submit-throttle.interceptor.js';

class Routes {
  submit(): void {
    // Route de test : seules ses métadonnées comptent.
  }
}

const config = loadConfig({
  DATABASE_URL: 'postgres://x:y@localhost:5432/z',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
});

/** Redis simulé : `exec` renvoie le résultat donné (ou échoue). */
function fakeRedis(exec: () => Promise<unknown>): RedisClient {
  const chain = { incr: () => chain, expire: () => chain, ttl: () => chain, exec };
  return { redis: { multi: () => chain } } as unknown as RedisClient;
}

async function submit(redis: RedisClient) {
  const interceptor = new SubmitThrottleInterceptor(redis, config);
  const req: FakeRequest = { method: 'POST', url: '/x', headers: {} };
  const response = new FakeResponse();
  const handler = fakeHandler();
  const context = httpContext(routeHandler(Routes, 'submit'), Routes, req, response);
  try {
    await runWithRequestInfo({ requestId: 'r', ip: '203.0.113.7', userAgent: null }, async () =>
      lastValueFrom(await interceptor.intercept(context, handler)),
    );
    return { response, handled: handler.calls === 1, error: undefined };
  } catch (error) {
    return { response, handled: handler.calls === 1, error };
  }
}

const code = (error: unknown) => (error instanceof DomainProblem ? error.code : undefined);

describe('SubmitThrottleInterceptor (pub.request, 5 par heure)', () => {
  it('sous la limite : la demande passe', async () => {
    const r = await submit(
      fakeRedis(() =>
        Promise.resolve([
          [null, SUBMISSIONS_PER_HOUR],
          [null, 1],
          [null, 3000],
        ]),
      ),
    );
    expect(r.handled).toBe(true);
    expect(r.error).toBeUndefined();
  });

  it('au-delà : 429 too_many_requests, Retry-After = fin de la fenêtre', async () => {
    const r = await submit(
      fakeRedis(() =>
        Promise.resolve([
          [null, SUBMISSIONS_PER_HOUR + 1],
          [null, 0],
          [null, 1234],
        ]),
      ),
    );
    expect(code(r.error)).toBe('too_many_requests');
    expect(r.response.getHeader('retry-after')).toBe('1234');
    expect(r.handled).toBe(false);
  });

  it.each([
    ['Redis indisponible', () => Promise.reject(new Error('ECONNREFUSED'))],
    ['compteur illisible', () => Promise.resolve([[null, 'x']])],
  ])('%s : refus (429, Retry-After 60), jamais d’envois illimités', async (_name, exec) => {
    const r = await submit(fakeRedis(exec));
    expect(code(r.error)).toBe('too_many_requests');
    expect(r.response.getHeader('retry-after')).toBe('60');
    expect(r.handled).toBe(false);
  });
});
