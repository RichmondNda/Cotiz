import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { PurgeOrphanFilesUseCase } from '../../src/modules/files/application/purge-orphan-files.use-case.js';
import { REDIS_PREFIX, redisConnection } from '../../src/shared/queues/index.js';
import { Housekeeping, ScheduledTasks } from '../../src/shared/scheduler/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';
import { startMinio, type TestMinio } from '../support/minio.js';

/**
 * Tâche housekeeping (jobs.yaml : quotidienne 03:00, lot 0.5) : fichiers orphelins en quarantaine depuis plus de 24 h.
 * Vérification de l'étape : deux workers → une seule exécution.
 */

const HOUR = 3600 * 1000;
const FILES = {
  stalePending: '00000000-0000-7000-8000-0000000f1001',
  recentPending: '00000000-0000-7000-8000-0000000f1002',
  clean: '00000000-0000-7000-8000-0000000f1003',
  infected: '00000000-0000-7000-8000-0000000f1004',
  /** PDF produit par le serveur, resté `pending` (valeur par défaut) : jamais purgé (règle 8). */
  serverPdf: '00000000-0000-7000-8000-0000000f1005',
} as const;

describe('housekeeping : fichiers orphelins, une seule exécution', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let minio: TestMinio;
  let workers: INestApplicationContext[];
  let s3: S3Client;

  const exists = (key: string) =>
    s3.send(new HeadObjectCommand({ Bucket: 'cotiz-proofs', Key: key })).then(
      () => true,
      () => false,
    );
  const put = (key: string) =>
    s3.send(new PutObjectCommand({ Bucket: 'cotiz-proofs', Key: key, Body: 'x', ContentType: 'application/pdf' }));
  const ids = async () =>
    ((await h.superuser('SELECT id FROM files ORDER BY id')).rows as { id: string }[]).map((r) => r.id);

  beforeAll(async () => {
    [h, redis, minio] = await Promise.all([
      startIsolationHarness('migrated'),
      new RedisContainer('redis:7-alpine').start(),
      startMinio(),
    ]);
    await seedAssociations(h);
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: minio.endpoint,
      S3_ACCESS_KEY_ID: minio.accessKeyId,
      S3_SECRET_ACCESS_KEY: minio.secretAccessKey,
      OUTBOX_RELAY_INTERVAL_MS: '0',
    });
    // Deux processus worker sur le même Redis, comme deux répliques en production.
    workers = await Promise.all([
      NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false }),
      NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false }),
    ]);
    s3 = new S3Client({
      endpoint: minio.endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: minio.accessKeyId, secretAccessKey: minio.secretAccessKey },
    });

    const insert = `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name,
                                       mime_type, size_bytes, sha256, scan_status, created_at)
                    VALUES ($1, NULL, $2, 'payment_proof', 'cotiz-proofs', $3, 'x.pdf', 'application/pdf', 1, $4, $5,
                            now() - $6::interval)`;
    await h.superuser(insert, [
      FILES.stalePending,
      USERS.moussa,
      `quarantine/${FILES.stalePending}`,
      null,
      'pending',
      '25 hours',
    ]);
    await h.superuser(insert, [
      FILES.recentPending,
      USERS.moussa,
      `quarantine/${FILES.recentPending}`,
      null,
      'pending',
      '1 hour',
    ]);
    await h.superuser(insert, [
      FILES.clean,
      USERS.moussa,
      `unassigned/payment_proof/${FILES.clean}.pdf`,
      'a'.repeat(64),
      'clean',
      '30 days',
    ]);
    await h.superuser(insert, [
      FILES.infected,
      USERS.moussa,
      `quarantine/${FILES.infected}`,
      'b'.repeat(64),
      'infected',
      '30 days',
    ]);
    await h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes, created_at)
       VALUES ($1, $2, $3, 'invoice_pdf', 'cotiz-legal', $4, 'facture.pdf', 'application/pdf', 1, now() - interval '30 days')`,
      [FILES.serverPdf, A.id, USERS.awa, `${A.id}/invoice_pdf/${FILES.serverPdf}.pdf`],
    );
    for (const key of [
      `quarantine/${FILES.stalePending}`,
      `quarantine/${FILES.recentPending}`,
      `unassigned/payment_proof/${FILES.clean}.pdf`,
      `unassigned/payment_proof/${FILES.clean}.pdf.thumb.webp`,
      `quarantine/${FILES.infected}`,
      'quarantine/egare-sans-ligne',
    ]) {
      await put(key);
    }
  });

  afterAll(async () => {
    s3.destroy();
    await Promise.all(workers.map((w) => w.close()));
    await Promise.all([h.stop(), redis.stop(), minio.stop()]);
  });

  it('purge le dépôt jamais confirmé de plus de 24 h (ligne et objet), garde tout le reste', async () => {
    await workers[0]?.get(PurgeOrphanFilesUseCase).execute(new Date());
    expect(await ids()).toEqual([FILES.recentPending, FILES.clean, FILES.infected, FILES.serverPdf].sort());
    expect(await exists(`quarantine/${FILES.stalePending}`)).toBe(false);
    expect(await exists(`quarantine/${FILES.recentPending}`)).toBe(true);
    expect(await exists(`unassigned/payment_proof/${FILES.clean}.pdf`)).toBe(true);
    expect(await exists(`unassigned/payment_proof/${FILES.clean}.pdf.thumb.webp`)).toBe(true);
    // Objet égaré récent (moins de 24 h) : gardé.
    expect(await exists('quarantine/egare-sans-ligne')).toBe(true);
  });

  it('24 h plus tard : objets égarés en quarantaine supprimés ; fichiers analysés et miniatures jamais touchés', async () => {
    await workers[0]?.get(PurgeOrphanFilesUseCase).execute(new Date(Date.now() + 25 * HOUR));
    expect(await exists('quarantine/egare-sans-ligne')).toBe(false);
    expect(await exists(`quarantine/${FILES.recentPending}`)).toBe(false);
    // Objet resté en quarantaine d'un fichier refusé : supprimé ; la ligne (trace de l'analyse) reste.
    expect(await exists(`quarantine/${FILES.infected}`)).toBe(false);
    expect(await ids()).toEqual([FILES.clean, FILES.infected, FILES.serverPdf].sort());
    expect(await exists(`unassigned/payment_proof/${FILES.clean}.pdf`)).toBe(true);
    expect(await exists(`unassigned/payment_proof/${FILES.clean}.pdf.thumb.webp`)).toBe(true);
  });

  it('tâches planifiées une seule fois (housekeeping quotidienne à 03:00), même enregistrées par deux workers', async () => {
    const queue = new Queue('scheduled', {
      connection: redisConnection(redis.getConnectionUrl()),
      prefix: REDIS_PREFIX,
    });
    try {
      // Enregistrement en arrière-plan au démarrage des workers.
      let schedulers = await queue.getJobSchedulers();
      for (let i = 0; i < 50 && schedulers.length < 6; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        schedulers = await queue.getJobSchedulers();
      }
      // Chaque tâche du worker une seule fois (codes.expire : lot 1.1 ; stats.refresh : lot 1.4 ; projects.activate : lot 2.2 ; installments.refresh-statuses : lot 2.4).
      const byId = schedulers
        .map((s) => ({ id: s.key, pattern: s.pattern, tz: s.tz }))
        .sort((x, y) => x.id.localeCompare(y.id));
      expect(byId).toEqual([
        { id: 'codes.expire', pattern: '0 * * * *', tz: 'Africa/Abidjan' },
        { id: 'housekeeping', pattern: '0 3 * * *', tz: 'Africa/Abidjan' },
        { id: 'installments.due-soon', pattern: '0 * * * *', tz: 'Africa/Abidjan' },
        { id: 'installments.refresh-statuses', pattern: '0 * * * *', tz: 'Africa/Abidjan' },
        { id: 'projects.activate', pattern: '30 0 * * *', tz: 'Africa/Abidjan' },
        { id: 'schedule.extend-rolling', pattern: '0 1 1 * *', tz: 'Africa/Abidjan' },
        { id: 'stats.refresh', pattern: '*/15 * * * *', tz: 'Africa/Abidjan' },
      ]);
    } finally {
      await queue.close();
    }
  });

  it('deux workers déclenchent la même échéance : une seule exécution', async () => {
    let runs = 0;
    const unregister = workers.map((w) =>
      w.get(Housekeeping).register('test.compteur', () => {
        runs++;
        return Promise.resolve();
      }),
    );
    try {
      await Promise.all(workers.map((w) => w.get(ScheduledTasks).runNow('housekeeping', '2026-10-10T03:00')));
      for (let i = 0; i < 50 && runs === 0; i++) await new Promise((resolve) => setTimeout(resolve, 100));
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      expect(runs).toBe(1);
    } finally {
      for (const fn of unregister) fn();
    }
  });

  it('deux exécutions simultanées (verrou) : une seule passe, l’autre est ignorée', async () => {
    let runs = 0;
    const unregister = workers.map((w) =>
      w.get(Housekeeping).register('test.lent', async () => {
        runs++;
        await new Promise((resolve) => setTimeout(resolve, 300));
      }),
    );
    try {
      const outcomes = await Promise.all(workers.map((w) => w.get(ScheduledTasks).executeWithLock('housekeeping')));
      expect(outcomes.sort()).toEqual(['exécuté', 'ignoré']);
      expect(runs).toBe(1);
    } finally {
      for (const fn of unregister) fn();
    }
  });
});
