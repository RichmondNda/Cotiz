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
  files: {
    name: 'files',
    concurrency: 4,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  },
  /** Génération PDF par Gotenberg (jobs.yaml : concurrence 2) ; un moteur indisponible est repris plus tard. */
  documents: {
    name: 'documents',
    concurrency: 2,
    jobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 30 * 24 * 3600 },
    },
  },
  /**
   * Envois Web Push (jobs.yaml : concurrence 10, 3 tentatives, heures calmes 21 h – 8 h pour le non urgent : job
   * différé). Service de push injoignable : repris ; abonnement expiré (404/410) : révoqué, pas d'erreur.
   */
  'notify-push': {
    name: 'notify-push',
    concurrency: 10,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      // Le job porte le texte du message (nom, montant) : gardé 24 h, le temps d'écarter un envoi rejoué par son jobId.
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 24 * 3600 },
    },
  },
  /**
   * Imports de fichiers (jobs.yaml : concurrence 1 par association, verrou par association dans le processeur) :
   * analyse, classement des lignes, exécution. Une exécution interrompue reprend aux lignes non traitées.
   */
  imports: {
    name: 'imports',
    concurrency: 4,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 10_000 },
      removeOnComplete: { age: 24 * 3600, count: 10_000 },
      removeOnFail: { age: 7 * 24 * 3600 },
    },
  },
  /** Tâches planifiées (jobs.yaml, section scheduled) : une purge en échec (MinIO absent…) est reprise. */
  scheduled: {
    name: 'scheduled',
    concurrency: 1,
    jobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 60_000 },
      // Plus longtemps que la déduplication d'une échéance par son jobId (runNow).
      removeOnComplete: { age: 7 * 24 * 3600 },
      removeOnFail: { age: 30 * 24 * 3600 },
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
