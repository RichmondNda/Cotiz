import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { EventEnvelope } from '@cotiz/contracts';
import { runMigrations } from '@cotiz/db/migrate';
import { startTestDatabase, type TestDatabase } from '@cotiz/db/testing';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { type EventConsumer, EventConsumers, OutboxService } from '../../src/shared/outbox/index.js';
import { EventsProcessor, OutboxRelay } from '../../src/shared/outbox/worker.js';
import { QUEUES, redisConnection } from '../../src/shared/queues/index.js';
import { currentTx, TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';

const A = '00000000-0000-7000-8000-00000000a001';
const AWA = '00000000-0000-7000-8000-000000000001';
const FILE = '00000000-0000-7000-8000-0000000f0001';

const fileUploaded = (fileId = FILE) =>
  ({
    type: 'file.uploaded',
    associationId: A,
    actorUserId: AWA,
    aggregate: { type: 'file', id: fileId },
    payload: { fileId, purpose: 'payment_proof' },
  }) as const;

interface OutboxRow {
  id: string;
  association_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  payload: unknown;
  published_at: Date | null;
  attempts: number;
}

describe('shared/outbox : publication, relais et consommation', () => {
  let db: TestDatabase;
  let redis: StartedRedisContainer;
  let worker: INestApplicationContext;
  let tenantDb: TenantDatabase;
  let outbox: OutboxService;
  let relay: OutboxRelay;
  let consumers: EventConsumers;
  let processor: EventsProcessor;
  let events: Queue;
  /** Client Redis du test : pannes simulées, nettoyage. */
  let admin: Redis;
  let unregister: (() => void)[] = [];

  const register = (consumer: EventConsumer) => unregister.push(consumers.register(consumer));

  async function superuser<T extends pg.QueryResultRow>(text: string, values?: unknown[]) {
    const client = new pg.Client({ connectionString: db.superuserUrl });
    await client.connect();
    try {
      return (await client.query<T>(text, values)).rows;
    } finally {
      await client.end();
    }
  }

  const outboxRows = () => superuser<OutboxRow>('SELECT * FROM outbox_events ORDER BY id');

  /** Publie dans une transaction de tâche d'association, comme un cas d'usage. */
  const publishAs = (event: Parameters<OutboxService['publish']>[1]) =>
    tenantDb.withTenantContext({ space: 'association', associationId: A, userId: AWA }, () =>
      outbox.publish(currentTx(), event),
    );

  /** Attend que la file `events` soit vide (ni en attente, ni active, ni en reprise). */
  async function drained(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      const counts = await events.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      if (Object.values(counts).every((n) => n === 0)) return;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error('file events non vidée');
  }

  beforeAll(async () => {
    [db, redis] = await Promise.all([startTestDatabase(), new RedisContainer('redis:7-alpine').start()]);
    await runMigrations(db.urlFor('cotiz_migrator'));
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      // Relais piloté par les tests (relayOnce) ; le traitement de la file tourne.
      OUTBOX_RELAY_INTERVAL_MS: '0',
    });
    worker = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false });
    tenantDb = worker.get(TenantDatabase);
    outbox = worker.get(OutboxService);
    relay = worker.get(OutboxRelay);
    consumers = worker.get(EventConsumers);
    processor = worker.get(EventsProcessor);
    admin = new Redis(config.REDIS_URL);
    events = new Queue(QUEUES.events.name, { connection: redisConnection(config.REDIS_URL), prefix: 'cotiz' });
  });

  afterEach(async () => {
    await drained();
    for (const fn of unregister) fn();
    unregister = [];
    await events.obliterate({ force: true });
    await superuser('TRUNCATE outbox_events');
    const keys = await admin.keys('cotiz:dedupe:*');
    if (keys.length > 0) await admin.del(...keys);
  });

  afterAll(async () => {
    await events.close();
    admin.disconnect();
    await worker.close();
    await Promise.all([db.container.stop(), redis.stop()]);
  });

  describe('OutboxService.publish', () => {
    it('écrit l’événement dans la transaction du cas d’usage, non publié', async () => {
      await publishAs(fileUploaded());
      const rows = await outboxRows();
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        association_id: A,
        actor_user_id: AWA,
        event_type: 'file.uploaded',
        event_version: 1,
        aggregate_type: 'file',
        aggregate_id: FILE,
        payload: { fileId: FILE, purpose: 'payment_proof' },
        published_at: null,
        attempts: 0,
      });
    });

    it('transaction annulée : aucun événement', async () => {
      await expect(
        tenantDb.withTenantContext({ space: 'association', associationId: A }, async () => {
          await outbox.publish(currentTx(), fileUploaded());
          throw new Error('échec du cas d’usage');
        }),
      ).rejects.toThrow('échec du cas d’usage');
      expect(await outboxRows()).toEqual([]);
      expect(await relay.relayOnce()).toBe(0);
    });

    it('refuse un payload qui ne suit pas events.yaml, sans rien écrire', async () => {
      const event = { ...fileUploaded(), payload: { fileId: FILE } };
      await expect(publishAs(event as never)).rejects.toThrow(/events\.yaml/);
      expect(await outboxRows()).toEqual([]);
    });

    it('en espace association, refuse un événement d’une autre association ou sans association', async () => {
      const B = '00000000-0000-7000-8000-00000000a002';
      await expect(publishAs({ ...fileUploaded(), associationId: B })).rejects.toThrow(/association du contexte/);
      await expect(publishAs({ ...fileUploaded(), associationId: null })).rejects.toThrow(/association du contexte/);
      expect(await outboxRows()).toEqual([]);
    });

    it('refuse un payload dont associationId diffère de l’enveloppe', async () => {
      const B = '00000000-0000-7000-8000-00000000a002';
      const event = {
        type: 'association.updated',
        associationId: A,
        actorUserId: AWA,
        aggregate: { type: 'association', id: A },
        payload: { associationId: B, changedFields: ['name'] },
      } as const;
      await expect(publishAs(event)).rejects.toThrow(/payload\.associationId/);
      await publishAs({ ...event, payload: { associationId: A, changedFields: ['name'] } });
      expect(await outboxRows()).toHaveLength(1);
    });

    it('s’écrit depuis un contexte d’association sans pouvoir relire l’outbox (politique relay)', async () => {
      const seen = await tenantDb.withTenantContext({ space: 'association', associationId: A }, async () => {
        await outbox.publish(currentTx(), fileUploaded());
        const res = await currentTx().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM outbox_events`);
        return res.rows[0]?.n;
      });
      expect(seen).toBe(0);
      expect(await outboxRows()).toHaveLength(1);
    });
  });

  describe('OutboxRelay', () => {
    it('pousse l’enveloppe dans la file events et pose published_at', async () => {
      await publishAs(fileUploaded());
      const id = (await outboxRows())[0]?.id ?? '';
      // Rien ne consomme file.uploaded à ce stade : le job est traité sans effet.
      expect(await relay.relayOnce()).toBe(1);
      const job = await events.getJob(`event-${id}`);
      expect(job?.data).toEqual({
        id,
        type: 'file.uploaded',
        version: 1,
        occurredAt: expect.stringMatching(/Z$/) as string,
        associationId: A,
        actorUserId: AWA,
        aggregate: { type: 'file', id: FILE },
        payload: { fileId: FILE, purpose: 'payment_proof' },
      } satisfies EventEnvelope);
      const [after] = await outboxRows();
      expect(after?.published_at).toBeInstanceOf(Date);
      expect(after?.attempts).toBe(1);
      expect(await relay.relayOnce()).toBe(0);
    });

    it('deux relais simultanés ne publient chaque événement qu’une fois (SKIP LOCKED)', async () => {
      for (let i = 0; i < 30; i++) {
        await publishAs(fileUploaded(`00000000-0000-7000-8000-0000000f${String(i).padStart(4, '0')}`));
      }
      const relayed = await Promise.all([relay.relayOnce(), relay.relayOnce(), relay.relayOnce()]);
      expect(relayed.reduce((a, b) => a + b, 0)).toBe(30);
      const rows = await outboxRows();
      expect(rows.every((r) => r.published_at !== null && r.attempts === 1)).toBe(true);
    });

    it('relaie par lots de 100 au plus, dans l’ordre', async () => {
      for (let i = 0; i < 105; i++) {
        await publishAs(fileUploaded(`00000000-0000-7000-8000-0000000f${String(i).padStart(4, '0')}`));
      }
      expect(await relay.relayOnce()).toBe(100);
      const rows = await outboxRows();
      expect(rows.slice(0, 100).every((r) => r.published_at !== null)).toBe(true);
      expect(rows.slice(100).every((r) => r.published_at === null)).toBe(true);
      expect(await relay.relayOnce()).toBe(5);
    });

    it('une ligne invalide ne bloque pas les suivantes : elle passe derrière, non publiée', async () => {
      // Écrite hors OutboxService (SQL brut, ancienne version d'un type…) : payload non conforme.
      await superuser(
        `INSERT INTO outbox_events (association_id, event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, 'file.uploaded', 'file', $2, '{"fileId": "x"}')`,
        [A, FILE],
      );
      await publishAs(fileUploaded());
      expect(await relay.relayOnce()).toBe(1);
      const [invalid, valid] = await outboxRows();
      expect(invalid).toMatchObject({ published_at: null, attempts: 1 });
      expect(valid?.published_at).toBeInstanceOf(Date);
      // Un nouvel événement passe devant la ligne invalide.
      await publishAs(fileUploaded());
      expect(await relay.relayOnce()).toBe(1);
      expect((await outboxRows())[0]).toMatchObject({ published_at: null, attempts: 2 });
    });

    it('file Redis indisponible : rien n’est marqué publié, la tentative est comptée', async () => {
      await publishAs(fileUploaded());
      await admin.call('CLIENT', 'PAUSE', '2000', 'WRITE');
      const failing = relay.relayOnce({ timeoutMs: 500 });
      await expect(failing).rejects.toThrow();
      const [row] = await outboxRows();
      expect(row?.published_at).toBeNull();
      expect(row?.attempts).toBe(1);
      await admin.call('CLIENT', 'UNPAUSE');
      expect(await relay.relayOnce()).toBe(1);
    });
  });

  describe('consommation', () => {
    it('un événement relayé deux fois n’est consommé qu’une fois par consommateur', async () => {
      const handled: string[] = [];
      register({
        name: 'test-counter',
        types: ['file.uploaded'],
        handle: (event) => {
          handled.push(event.id);
          return Promise.resolve();
        },
      });
      await publishAs(fileUploaded());
      expect(await relay.relayOnce()).toBe(1);
      await drained();
      // Second relais du même événement (redémarrage entre l'envoi et le COMMIT) : nouveau job, même id.
      await events.clean(0, 1000, 'completed');
      await superuser('UPDATE outbox_events SET published_at = NULL');
      expect(await relay.relayOnce()).toBe(1);
      await drained();
      const [row] = await outboxRows();
      expect(handled).toEqual([row?.id]);
    });

    it('chaque consommateur abonné au type est appelé, pas les autres', async () => {
      const calls: string[] = [];
      const record = (name: string) => () => {
        calls.push(name);
        return Promise.resolve();
      };
      register({ name: 'files', types: ['file.uploaded'], handle: record('files') });
      register({ name: 'audit', types: ['file.uploaded', 'user.mfa_enabled'], handle: record('audit') });
      register({ name: 'other', types: ['payment.validated'], handle: record('other') });
      await publishAs(fileUploaded());
      await relay.relayOnce();
      await drained();
      expect(calls.sort()).toEqual(['audit', 'files']);
    });

    it('un consommateur en échec est repris sans rejouer ceux qui ont réussi', async () => {
      const calls: string[] = [];
      let failures = 1;
      register({
        name: 'stable',
        types: ['file.uploaded'],
        handle: () => {
          calls.push('stable');
          return Promise.resolve();
        },
      });
      register({
        name: 'flaky',
        types: ['file.uploaded'],
        handle: () => {
          calls.push('flaky');
          return failures-- > 0 ? Promise.reject(new Error('panne passagère')) : Promise.resolve();
        },
      });
      const envelope = await publishAndRead();
      await expect(processor.process(envelope)).rejects.toThrow('panne passagère');
      await processor.process(envelope);
      await processor.process(envelope);
      expect(calls.filter((c) => c === 'stable')).toHaveLength(1);
      expect(calls.filter((c) => c === 'flaky')).toHaveLength(2);
    });

    it('un consommateur en échec annule ses écritures', async () => {
      register({
        name: 'writer',
        types: ['file.uploaded'],
        handle: async () => {
          await currentTx().execute(sql`INSERT INTO audit_logs (actor_role, action, entity_type)
                                        VALUES ('system', 'test.write', 'file')`);
          throw new Error('échec après écriture');
        },
      });
      const envelope = await publishAndRead();
      await expect(processor.process(envelope)).rejects.toThrow('échec après écriture');
      expect(await superuser("SELECT 1 FROM audit_logs WHERE action = 'test.write'")).toEqual([]);
    });

    it('le consommateur s’exécute dans le contexte de l’association de l’événement', async () => {
      const seen: unknown[] = [];
      register({
        name: 'context',
        types: ['file.uploaded', 'plan.updated'],
        handle: async () => {
          const res = await currentTx().execute<{ aid: string | null; space: string }>(
            sql`SELECT app_association_id() AS aid, app_space() AS space`,
          );
          seen.push(res.rows[0]);
        },
      });
      await processor.process(await publishAndRead());
      // Événement sans association (plateforme) : contexte system.
      await tenantDb.withTenantContext({ space: 'system' }, () =>
        outbox.publish(currentTx(), {
          type: 'plan.updated',
          associationId: null,
          actorUserId: null,
          aggregate: { type: 'plan', id: FILE },
          payload: { planId: FILE },
        }),
      );
      const rows = await outboxRows();
      await processor.process(toEnvelope(rows[rows.length - 1]));
      expect(seen).toEqual([
        { aid: A, space: 'association' },
        { aid: null, space: 'system' },
      ]);
    });

    it('ownTransactions : le consommateur est appelé hors transaction et ouvre les siennes, puis est marqué', async () => {
      const seen: string[] = [];
      let calls = 0;
      register({
        name: 'own-transactions',
        types: ['file.uploaded'],
        ownTransactions: true,
        handle: async () => {
          calls++;
          expect(() => currentTx()).toThrow('hors contexte tenant');
          const res = await tenantDb.withTenantContext({ space: 'system' }, () =>
            currentTx().execute<{ space: string }>(sql`SELECT app_space() AS space`),
          );
          seen.push(res.rows[0]?.space ?? '');
        },
      });
      const envelope = await publishAndRead();
      await processor.process(envelope);
      await processor.process(envelope);
      expect(seen).toEqual(['system']);
      expect(calls).toBe(1);
    });

    it('refuse un nom de consommateur en double', () => {
      const consumer = { name: 'dup', types: ['file.uploaded'] as const, handle: () => Promise.resolve() };
      register(consumer);
      expect(() => consumers.register(consumer)).toThrow(/dup/);
    });

    it('refuse une enveloppe invalide', async () => {
      await expect(processor.process({ id: 'x' })).rejects.toThrow();
    });
  });

  async function publishAndRead(): Promise<EventEnvelope> {
    await publishAs(fileUploaded());
    const rows = await outboxRows();
    return toEnvelope(rows[rows.length - 1]);
  }

  function toEnvelope(row: OutboxRow | undefined): EventEnvelope {
    if (!row) throw new Error('aucun événement');
    return {
      id: row.id,
      type: row.event_type as EventEnvelope['type'],
      version: row.event_version,
      occurredAt: new Date().toISOString(),
      associationId: row.association_id,
      actorUserId: row.actor_user_id,
      aggregate: { type: row.aggregate_type, id: row.aggregate_id },
      payload: row.payload as Record<string, unknown>,
    };
  }
});
