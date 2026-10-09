import type { DefaultJobOptions, RedisOptions } from 'bullmq';

/** Préfixe des clés Redis de Cotiz (files BullMQ, déduplication). */
export const REDIS_PREFIX = 'cotiz';

/** Files BullMQ et leurs réglages (docs/specs/jobs.yaml). Chaque lot ajoute les siennes. */
export const QUEUES = {
  events: {
    name: 'events',
    concurrency: 10,
    jobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 1_000 },
      // Assez longtemps pour qu'un second relais du même événement soit écarté par son jobId.
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  },
} as const satisfies Record<string, { name: string; concurrency: number; jobOptions: DefaultJobOptions }>;

/**
 * Options de connexion BullMQ depuis REDIS_URL (redis:// ou rediss://). Objet d'options plutôt qu'une instance :
 * BullMQ embarque sa propre version d'ioredis.
 */
export function redisConnection(url: string): RedisOptions {
  const parsed = new URL(url);
  const db = parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0;
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.username ? { username: decodeURIComponent(parsed.username) } : {}),
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    db,
    ...(parsed.protocol === 'rediss:' ? { tls: {} } : {}),
    // Exigé par les workers BullMQ (commandes bloquantes).
    maxRetriesPerRequest: null,
  };
}
