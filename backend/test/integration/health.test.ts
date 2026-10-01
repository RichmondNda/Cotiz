import type { INestApplication } from '@nestjs/common';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HealthLiveResponse, HealthReadyResponse } from '@cotiz/contracts';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

// sys.health contre de vrais PostgreSQL 16, Redis 7 et MinIO (mêmes images que infra/compose/local.yml).
describe('sys.health', () => {
  let postgres: StartedPostgreSqlContainer;
  let redis: StartedRedisContainer;
  let minio: StartedTestContainer;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    [postgres, redis, minio] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RedisContainer('redis:7-alpine').start(),
      new GenericContainer('cgr.dev/chainguard/minio:latest')
        .withCommand(['server', '/data'])
        .withEnvironment({ MINIO_ROOT_USER: 'cotiz', MINIO_ROOT_PASSWORD: 'cotiz-test-minio' })
        .withExposedPorts(9000)
        .withWaitStrategy(Wait.forHttp('/minio/health/ready', 9000))
        .start(),
    ]);
    const config = loadConfig({
      DATABASE_URL: postgres.getConnectionUri(),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: `http://${minio.getHost()}:${String(minio.getMappedPort(9000))}`,
    });
    app = await createApp(config, { logger: false });
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([postgres.stop(), redis.stop(), minio.stop()]);
  });

  it('GET /health/live renvoie 200', async () => {
    const res = await fetch(`${baseUrl}/health/live`);
    expect(res.status).toBe(200);
    expect(HealthLiveResponse.parse(await res.json())).toEqual({ status: 'ok' });
  });

  it('GET /health/ready renvoie 200 quand PostgreSQL, Redis et MinIO répondent', async () => {
    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(200);
    expect(HealthReadyResponse.parse(await res.json())).toEqual({
      status: 'ok',
      checks: { postgres: 'up', redis: 'up', minio: 'up' },
    });
  });

  it('GET /health/ready renvoie 503 si Redis est arrêté', async () => {
    await redis.stop();
    const started = Date.now();
    const res = await fetch(`${baseUrl}/health/ready`);
    expect(res.status).toBe(503);
    expect(HealthReadyResponse.parse(await res.json())).toEqual({
      status: 'unavailable',
      checks: { postgres: 'up', redis: 'down', minio: 'up' },
    });
    // Une dépendance absente ne doit pas bloquer la sonde.
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
