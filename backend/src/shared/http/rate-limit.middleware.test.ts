import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { DomainProblem } from './domain-problem.js';
import type { CounterStore } from './rate-limit.interceptor.js';
import { IpRateLimitMiddleware } from './rate-limit.middleware.js';
import { FakeResponse } from './testing.js';

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

const config = loadConfig({
  DATABASE_URL: 'postgres://x:y@localhost:5432/z',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  RATE_LIMIT_IP_PER_MIN: '3',
});

function setup() {
  const counters = new MemoryCounters();
  const middleware = new IpRateLimitMiddleware(counters, config);
  const call = async (ip: string, url = '/api/v1/uploads') => {
    const response = new FakeResponse();
    let error: unknown;
    let passed = false;
    await middleware.use({ ip, originalUrl: url }, response, (err?: unknown) => {
      if (err) error = err;
      else passed = true;
    });
    return { passed, error, response };
  };
  return { counters, call };
}

describe('IpRateLimitMiddleware (avant les gardes)', () => {
  it('au-delà du plafond par IP : 429 too_many_requests et Retry-After, sans atteindre la route', async () => {
    const { call } = setup();
    for (let i = 0; i < 3; i++) expect((await call('203.0.113.7')).passed).toBe(true);
    const fourth = await call('203.0.113.7');
    expect(fourth.passed).toBe(false);
    expect(fourth.error instanceof DomainProblem && fourth.error.code).toBe('too_many_requests');
    expect(fourth.response.getHeader('retry-after')).toBe('42');
    expect((await call('198.51.100.1')).passed).toBe(true);
  });

  it('les sondes de santé ne sont jamais comptées', async () => {
    const { call, counters } = setup();
    for (let i = 0; i < 10; i++) {
      expect((await call('10.0.0.1', '/api/v1/health/ready')).passed).toBe(true);
      expect((await call('10.0.0.1', '/api/v1/health/live?x=1')).passed).toBe(true);
    }
    expect(counters.counts.size).toBe(0);
  });

  it('Redis indisponible : la requête passe', async () => {
    const { call, counters } = setup();
    counters.failing = true;
    expect((await call('203.0.113.7')).passed).toBe(true);
  });
});
