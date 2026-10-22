import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Config } from '../../src/config.js';
import { RedisClient } from '../../src/shared/redis/redis.module.js';

/**
 * Client Redis de l'api : connexion ouverte au démarrage, pour que la première requête ne paie pas l'ouverture
 * dans le délai de 500 ms des commandes (un endpoint limité refuserait alors en 429). Redis absent : le démarrage
 * continue.
 */
describe('RedisClient', () => {
  let redis: StartedRedisContainer;

  beforeAll(async () => {
    redis = await new RedisContainer('redis:7-alpine').start();
  });

  afterAll(async () => {
    await redis.stop();
  });

  it('se connecte au démarrage, avant toute commande', async () => {
    const client = new RedisClient({ REDIS_URL: redis.getConnectionUrl() } as Config);
    try {
      await client.onModuleInit();
      expect(client.redis.status).toBe('ready');
    } finally {
      client.onModuleDestroy();
    }
  });

  it('Redis injoignable : le démarrage continue', async () => {
    const client = new RedisClient({ REDIS_URL: 'redis://127.0.0.1:1' } as Config);
    try {
      await expect(client.onModuleInit()).resolves.toBeUndefined();
      expect(client.redis.status).not.toBe('ready');
    } finally {
      client.onModuleDestroy();
    }
  });
});
