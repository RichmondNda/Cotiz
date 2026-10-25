import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ActivateProjectsUseCase } from '../../src/modules/projects/application/activate-projects.use-case.js';
import { WorkerModule } from '../../src/worker.module.js';
import { A, B, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Tâche projects.activate (jobs.yaml : quotidienne 00:30, lot 2.2), horloge simulée : un projet aux inscriptions
 * ouvertes passe en cours à sa date de début (jour civil d'Abidjan), dans toutes les associations ; les autres
 * statuts ne bougent pas. Idempotente.
 */

/** 24 octobre 2026, 00:30 à Abidjan (UTC). */
const NOW = new Date('2026-10-24T00:30:00Z');

const P = {
  startsToday: '00000000-0000-7000-8000-0000000ac001',
  startedBefore: '00000000-0000-7000-8000-0000000ac002',
  startsTomorrow: '00000000-0000-7000-8000-0000000ac003',
  draftStarted: '00000000-0000-7000-8000-0000000ac004',
  completedStarted: '00000000-0000-7000-8000-0000000ac005',
  ofBToday: '00000000-0000-7000-8000-0000000ac006',
  activeStarted: '00000000-0000-7000-8000-0000000ac007',
  archivedStarted: '00000000-0000-7000-8000-0000000ac008',
} as const;

describe('projects.activate', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let worker: INestApplicationContext;

  const states = async () =>
    Object.fromEntries(
      (
        (await h.superuser('SELECT id, status, version FROM projects ORDER BY id')).rows as {
          id: string;
          status: string;
          version: number;
        }[]
      ).map((r) => [r.id, `${r.status}@${String(r.version)}`]),
    );

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await seedAssociations(h);
    worker = await NestFactory.createApplicationContext(
      WorkerModule.register(
        loadConfig({
          NODE_ENV: 'test',
          DATABASE_URL: h.db.urlFor('cotiz_app'),
          REDIS_URL: redis.getConnectionUrl(),
          S3_ENDPOINT: 'http://127.0.0.1:1',
          OUTBOX_RELAY_INTERVAL_MS: '0',
        }),
      ),
      { logger: false },
    );
  });

  afterAll(async () => {
    await worker.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await h.superuser('DELETE FROM projects');
    const insert = `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency,
                                          due_day, schedule_type, start_date, created_by)
                    VALUES ($1, $2, 'P', '', $3, 5000, 'weekly', 6, 'rolling', $4, $5)`;
    for (const [id, aid, status, start] of [
      [P.startsToday, A.id, 'enrolling', '2026-10-24'],
      [P.startedBefore, A.id, 'enrolling', '2026-09-01'],
      [P.startsTomorrow, A.id, 'enrolling', '2026-10-25'],
      [P.draftStarted, A.id, 'draft', '2026-09-01'],
      [P.completedStarted, A.id, 'completed', '2026-09-01'],
      [P.ofBToday, B.id, 'enrolling', '2026-10-24'],
      [P.activeStarted, A.id, 'active', '2026-09-01'],
      [P.archivedStarted, A.id, 'archived', '2026-09-01'],
    ] as const) {
      await h.superuser(insert, [id, aid, status, start, USERS.awa]);
    }
  });

  it('inscriptions ouvertes dont la date de début est atteinte : en cours (toutes associations), version suivante', async () => {
    await worker.get(ActivateProjectsUseCase).execute(NOW);
    expect(await states()).toEqual({
      [P.startsToday]: 'active@2',
      [P.startedBefore]: 'active@2',
      [P.startsTomorrow]: 'enrolling@1',
      [P.draftStarted]: 'draft@1',
      [P.completedStarted]: 'completed@1',
      [P.ofBToday]: 'active@2',
      // Déjà en cours ou archivé : ni statut ni version ne bougent (un If-Match de la veille reste valable).
      [P.activeStarted]: 'active@1',
      [P.archivedStarted]: 'archived@1',
    });
  });

  it('jour civil du fuseau de la plateforme (Abidjan, UTC) : la veille à 23:59, rien ne démarre ; idempotente', async () => {
    await worker.get(ActivateProjectsUseCase).execute(new Date('2026-10-23T23:59:00Z'));
    expect((await states())[P.startsToday]).toBe('enrolling@1');
    await worker.get(ActivateProjectsUseCase).execute(NOW);
    await worker.get(ActivateProjectsUseCase).execute(NOW);
    expect((await states())[P.startsToday]).toBe('active@2');
  });
});
