import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { Controller, Get, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runMigrations } from '@cotiz/db/migrate';
import { startTestDatabase, type TestDatabase } from '@cotiz/db/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { WithoutTenantContext } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { freePort } from '../support/free-port.js';

/**
 * Métriques Prometheus (lot 0.6, étape 2), sur le port interne de chaque processus, jamais sous /api/v1 :
 * api → RED par route (taux, erreurs, durée) ; worker → files BullMQ et âge de l'outbox.
 */

/** Valeur d'une série (`nom{étiquettes} valeur`) dans une exposition Prometheus. */
function sample(text: string, name: string, labels: Record<string, string> = {}): number | undefined {
  for (const line of text.split('\n')) {
    const match = /^([a-z0-9_:]+)(?:\{(.*)\})? (\S+)$/.exec(line);
    if (match?.[1] !== name) continue;
    const found: Record<string, string> = {};
    for (const [, key = '', value = ''] of (match[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)) found[key] = value;
    if (Object.entries(labels).every(([key, value]) => found[key] === value)) return Number(match[3]);
  }
  return undefined;
}

@Controller('metrics-probe')
@WithoutTenantContext()
class BrokenProbeController {
  @Get('broken/:id')
  broken(): never {
    throw new Error('panne');
  }
}

describe('métriques de l’api (RED)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let metricsUrl: string;

  beforeAll(async () => {
    const port = await freePort();
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      API_METRICS_PORT: String(port),
    });
    @Module({ imports: [AppModule.register(config)], controllers: [BrokenProbeController] })
    class MetricsRoot {}
    app = await NestFactory.create(MetricsRoot, { logger: false });
    configureApp(app, config);
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
    metricsUrl = `http://127.0.0.1:${String(port)}/metrics`;

    await fetch(`${baseUrl}/health/live`);
    await fetch(`${baseUrl}/health/live`);
    await fetch(`${baseUrl}/nope/0707070707`);
    await fetch(`${baseUrl}/metrics-probe/broken/123`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  afterAll(async () => {
    await app.close();
  });

  it('expose taux, erreurs et durée par route gabarit, méthode et statut', async () => {
    const text = await (await fetch(metricsUrl)).text();
    const live = { method: 'GET', route: '/api/v1/health/live', status: '200' };
    expect(sample(text, 'cotiz_http_requests_total', live)).toBe(2);
    expect(sample(text, 'cotiz_http_request_duration_seconds_count', live)).toBe(2);
    expect(sample(text, 'cotiz_http_request_duration_seconds_bucket', { ...live, le: '+Inf' })).toBe(2);
    expect(
      sample(text, 'cotiz_http_requests_total', {
        method: 'GET',
        route: '/api/v1/metrics-probe/broken/:id',
        status: '500',
      }),
    ).toBe(1);
  });

  it('jamais de valeur de chemin dans les étiquettes (identifiant, téléphone) : route `unmatched`', async () => {
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'cotiz_http_requests_total', { route: 'unmatched', status: '404' })).toBe(1);
    expect(text).not.toContain('0707070707');
    expect(text).not.toContain('broken/123');
  });

  it('expose les métriques du processus, étiquetées service="api"', async () => {
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'process_cpu_user_seconds_total', { service: 'api' })).toBeGreaterThanOrEqual(0);
    expect(sample(text, 'nodejs_eventloop_lag_p99_seconds', { service: 'api' })).toBeGreaterThanOrEqual(0);
  });

  it('n’expose ni l’outbox ni les files : réservées au worker (espace system)', async () => {
    const text = await (await fetch(metricsUrl)).text();
    expect(text).not.toContain('cotiz_outbox_');
    expect(text).not.toContain('cotiz_queue_jobs');
  });

  it('n’est pas servi par le port public de l’api', async () => {
    expect((await fetch(`${baseUrl}/metrics`)).status).toBe(404);
    expect((await fetch(`${baseUrl.replace('/api/v1', '')}/metrics`)).status).toBe(404);
  });
});

describe('métriques du worker (files BullMQ, outbox)', () => {
  let db: TestDatabase;
  let redis: StartedRedisContainer;
  let worker: INestApplicationContext;
  let scheduled: Queue;
  let metricsUrl: string;

  async function superuser(text: string) {
    const client = new pg.Client({ connectionString: db.superuserUrl });
    await client.connect();
    try {
      await client.query(text);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    [db, redis] = await Promise.all([startTestDatabase(), new RedisContainer('redis:7-alpine').start()]);
    await runMigrations(db.urlFor('cotiz_migrator'));
    const port = await freePort();
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      // Relais arrêté : les événements restent à publier.
      OUTBOX_RELAY_INTERVAL_MS: '0',
      WORKER_METRICS_PORT: String(port),
    });
    worker = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false });
    metricsUrl = `http://127.0.0.1:${String(port)}/metrics`;
    scheduled = new Queue(QUEUES.scheduled.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
    });
  });

  afterAll(async () => {
    await scheduled.obliterate({ force: true });
    await scheduled.close();
    await worker.close();
    await Promise.all([db.container.stop(), redis.stop()]);
  });

  it('sans événement en attente : outbox vide, âge 0', async () => {
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'cotiz_outbox_unpublished_events', { service: 'worker' })).toBe(0);
    expect(sample(text, 'cotiz_outbox_oldest_unpublished_age_seconds')).toBe(0);
    // 0 lu en base, pas une collecte en échec.
    expect(text).not.toContain('cotiz_metrics_collect_errors_total{');
  });

  it('expose le nombre d’événements non publiés et l’âge du plus ancien', async () => {
    await superuser(`
      INSERT INTO outbox_events (association_id, event_type, aggregate_type, aggregate_id, occurred_at, published_at)
      VALUES (NULL, 'file.uploaded', 'file', gen_random_uuid(), now() - interval '90 seconds', NULL),
             (NULL, 'file.uploaded', 'file', gen_random_uuid(), now() - interval '10 seconds', NULL),
             (NULL, 'file.uploaded', 'file', gen_random_uuid(), now() - interval '1 hour', now())`);
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'cotiz_outbox_unpublished_events')).toBe(2);
    const age = sample(text, 'cotiz_outbox_oldest_unpublished_age_seconds') ?? 0;
    expect(age).toBeGreaterThanOrEqual(90);
    expect(age).toBeLessThan(120);
  });

  it('expose les tâches de chaque file BullMQ par état', async () => {
    await scheduled.add('housekeeping', {}, { delay: 3_600_000 });
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'cotiz_queue_jobs', { queue: 'scheduled', state: 'delayed' })).toBeGreaterThanOrEqual(1);
    for (const queue of Object.values(QUEUES)) {
      expect(sample(text, 'cotiz_queue_jobs', { queue: queue.name, state: 'failed' })).toBeGreaterThanOrEqual(0);
    }
  });

  it('expose les métriques du processus, étiquetées service="worker"', async () => {
    const text = await (await fetch(metricsUrl)).text();
    expect(sample(text, 'process_cpu_user_seconds_total', { service: 'worker' })).toBeGreaterThanOrEqual(0);
  });
});
