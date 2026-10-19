import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { ExpireCodesUseCase } from '../../src/modules/identity/application/expire-codes.use-case.js';
import { ScheduledTasks } from '../../src/shared/scheduler/index.js';
import { WorkerModule } from '../../src/worker.module.js';
import { type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Tâche codes.expire (jobs.yaml : horaire, lot 1.1, étape 9), horloge simulée : codes expirés (code_encrypted effacé),
 * demandes de réinitialisation expirées.
 */

const HOUR = 3_600_000;
const T0 = new Date('2026-10-15T10:00:00Z');
const at = (offsetMs: number) => new Date(T0.getTime() + offsetMs);

const CODES = {
  expiredSealed: '00000000-0000-7000-8000-00000000e001',
  liveSealed: '00000000-0000-7000-8000-00000000e002',
  consumed: '00000000-0000-7000-8000-00000000e003',
  expiredReset: '00000000-0000-7000-8000-00000000e004',
  liveReset: '00000000-0000-7000-8000-00000000e005',
  /** Échu depuis 5 min : un jeton de réinitialisation obtenu juste avant peut encore servir. */
  recentlyExpiredReset: '00000000-0000-7000-8000-00000000e006',
  /** Activation bloquée par ses 5 essais, encore dans sa validité. */
  blockedSealed: '00000000-0000-7000-8000-00000000e007',
} as const;
const REQUESTS = {
  issuedExpired: '00000000-0000-7000-8000-00000000f001',
  issuedLive: '00000000-0000-7000-8000-00000000f002',
  pendingOld: '00000000-0000-7000-8000-00000000f003',
  pendingRecent: '00000000-0000-7000-8000-00000000f004',
  completedOld: '00000000-0000-7000-8000-00000000f005',
  issuedTokenAlive: '00000000-0000-7000-8000-00000000f006',
} as const;

describe('codes.expire', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let worker: INestApplicationContext;

  const code = (id: string) =>
    h
      .superuser('SELECT code_encrypted, expires_at, consumed_at FROM one_time_codes WHERE id = $1', [id])
      .then((r) => r.rows[0] as { code_encrypted: Buffer | null; consumed_at: Date | null });
  const status = (id: string) =>
    h
      .superuser('SELECT status FROM password_reset_requests WHERE id = $1', [id])
      .then((r) => (r.rows[0] as { status: string }).status);

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
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
    await h.superuser('DELETE FROM password_reset_requests');
    await h.superuser('DELETE FROM one_time_codes');
    const insertCode = `INSERT INTO one_time_codes (id, user_id, purpose, code_hash, expires_at, consumed_at, code_encrypted,
                                                    created_at, attempts)
                        VALUES ($1, $2, $3, 'x', $4, $5, $6, $7, $8)`;
    const sealed = Buffer.from([1, 2, 3]);
    for (const [id, purpose, expires, consumed, encrypted, attempts] of [
      [CODES.expiredSealed, 'activation', at(-HOUR), null, sealed, 0],
      [CODES.liveSealed, 'activation', at(HOUR), null, sealed, 0],
      [CODES.consumed, 'activation', at(-HOUR), at(-2 * HOUR), null, 0],
      [CODES.expiredReset, 'password_reset', at(-11 * 60_000), null, null, 0],
      [CODES.liveReset, 'password_reset', at(10 * 60_000), null, null, 0],
      [CODES.recentlyExpiredReset, 'password_reset', at(-5 * 60_000), null, null, 0],
      [CODES.blockedSealed, 'activation', at(HOUR), null, sealed, 5],
    ] as const) {
      await h.superuser(insertCode, [id, USERS.moussa, purpose, expires, consumed, encrypted, at(-3 * HOUR), attempts]);
    }
    const insertRequest = `INSERT INTO password_reset_requests (id, user_id, space, status, code_id, created_at)
                           VALUES ($1, $2, 'platform', $3, $4, $5)`;
    for (const [id, state, codeId, created] of [
      [REQUESTS.issuedExpired, 'code_issued', CODES.expiredReset, at(-HOUR)],
      [REQUESTS.issuedLive, 'code_issued', CODES.liveReset, at(-HOUR)],
      [REQUESTS.pendingOld, 'pending', null, at(-8 * 24 * HOUR)],
      [REQUESTS.pendingRecent, 'pending', null, at(-6 * 24 * HOUR)],
      [REQUESTS.completedOld, 'completed', null, at(-30 * 24 * HOUR)],
      [REQUESTS.issuedTokenAlive, 'code_issued', CODES.recentlyExpiredReset, at(-HOUR)],
    ] as const) {
      await h.superuser(insertRequest, [id, USERS.awa, state, codeId, created]);
    }
  });

  it('efface le chiffré des seuls codes expirés ou bloqués (5 essais), non consommés', async () => {
    await worker.get(ExpireCodesUseCase).execute(T0);
    expect((await code(CODES.expiredSealed)).code_encrypted).toBeNull();
    expect((await code(CODES.blockedSealed)).code_encrypted).toBeNull();
    expect((await code(CODES.liveSealed)).code_encrypted).not.toBeNull();
    expect((await code(CODES.consumed)).consumed_at).not.toBeNull();
  });

  it('expire les demandes au code échu non utilisé, et celles restées à traiter plus de 7 jours', async () => {
    await worker.get(ExpireCodesUseCase).execute(T0);
    expect(await status(REQUESTS.issuedExpired)).toBe('expired');
    expect(await status(REQUESTS.issuedLive)).toBe('code_issued');
    expect(await status(REQUESTS.pendingOld)).toBe('expired');
    expect(await status(REQUESTS.pendingRecent)).toBe('pending');
    expect(await status(REQUESTS.completedOld)).toBe('completed');
  });

  it('code échu depuis moins de 10 min : la demande attend (un jeton de réinitialisation peut encore servir)', async () => {
    await worker.get(ExpireCodesUseCase).execute(T0);
    expect(await status(REQUESTS.issuedTokenAlive)).toBe('code_issued');
    await worker.get(ExpireCodesUseCase).execute(at(6 * 60_000));
    expect(await status(REQUESTS.issuedTokenAlive)).toBe('expired');
  });

  it('horloge avancée : ce qui était encore valide expire au passage suivant ; idempotente', async () => {
    const useCase = worker.get(ExpireCodesUseCase);
    await useCase.execute(T0);
    await useCase.execute(at(2 * HOUR));
    expect((await code(CODES.liveSealed)).code_encrypted).toBeNull();
    expect(await status(REQUESTS.issuedLive)).toBe('expired');
    expect(await status(REQUESTS.pendingRecent)).toBe('pending');
    await useCase.execute(at(2 * 24 * HOUR));
    expect(await status(REQUESTS.pendingRecent)).toBe('expired');
    await useCase.execute(at(2 * 24 * HOUR));
    expect(await status(REQUESTS.completedOld)).toBe('completed');
  });

  it('déclarée au worker sous son nom de jobs.yaml, exécutable sous verrou', async () => {
    expect(await worker.get(ScheduledTasks).executeWithLock('codes.expire')).toBe('exécuté');
  });
});
