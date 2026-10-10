import { describe, expect, it } from 'vitest';
import { redisConnection } from './index.js';

describe('redisConnection', () => {
  it('lit hôte, port, base et identifiants de REDIS_URL', () => {
    expect(redisConnection('redis://user:p%40ss@cache.local:6380/2')).toEqual({
      host: 'cache.local',
      port: 6380,
      username: 'user',
      password: 'p@ss',
      db: 2,
      maxRetriesPerRequest: null,
    });
  });

  it('valeurs par défaut et TLS pour rediss://', () => {
    expect(redisConnection('rediss://cache.local')).toEqual({
      host: 'cache.local',
      port: 6379,
      db: 0,
      tls: {},
      maxRetriesPerRequest: null,
    });
  });
});
