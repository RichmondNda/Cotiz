import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../config.js';
import { runWithLogContext } from '../logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../queues/index.js';
import { ErrorReporter, traceJob } from '../telemetry/index.js';

/** Tâche planifiée (docs/specs/jobs.yaml, section scheduled). */
export interface ScheduledTask {
  name: string;
  /** Expression cron, dans le fuseau TIMEZONE. */
  pattern: string;
  run(): Promise<void>;
}

/** Fuseau des tâches planifiées de la plateforme (UTC, comme Abidjan et Dakar). */
export const TIMEZONE = 'Africa/Abidjan';
const QUEUE = QUEUES.scheduled.name;
/** Au-delà, un verrou abandonné (worker arrêté net) est libéré. */
const LOCK_TTL_MS = 30 * 60_000;
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Tâches planifiées du worker (architecture/05) : tâches répétables BullMQ (un planificateur par tâche, enregistré
 * de façon idempotente par chaque worker : une seule échéance créée), et un verrou Redis autour de chaque exécution :
 * avec plusieurs workers, ou un déclenchement manuel concurrent, une seule exécution à la fois.
 */
@Injectable()
export class ScheduledTasks implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ScheduledTasks.name);
  private readonly tasks = new Map<string, ScheduledTask>();
  private readonly redis: Redis;
  private readonly queue: Queue;
  private worker: Worker | undefined;
  private registration: Promise<void> | undefined;
  private stopped = false;

  constructor(
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    // Lié au contexte du démarrage : une socket ouverte pendant une tâche garderait sinon son contexte de journal.
    this.redis.on(
      'error',
      AsyncLocalStorage.bind((error: Error) => {
        this.logger.warn(`redis : ${error.message}`);
      }),
    );
    this.queue = new Queue(QUEUE, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.scheduled.jobOptions,
    });
    this.queue.on('error', (error) => {
      this.logger.warn(`file ${QUEUE} : ${error.message}`);
    });
  }

  /** Déclare une tâche (à l'initialisation des modules, avant le démarrage). */
  define(task: ScheduledTask): void {
    if (this.tasks.has(task.name)) throw new Error(`tâche planifiée déjà déclarée : ${task.name}`);
    this.tasks.set(task.name, task);
  }

  onApplicationBootstrap(): void {
    // En arrière-plan : Redis absent au démarrage ne doit pas bloquer le worker (relais, autres files).
    this.registration = this.registerSchedulers();
    this.worker = new Worker(
      QUEUE,
      async (job) => {
        await runWithLogContext({ queue: QUEUE, jobId: job.id, task: job.name }, () =>
          traceJob(QUEUE, job, () => this.executeWithLock(job.name)),
        );
      },
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: 1,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file ${QUEUE} : ${error.message}`);
    });
    this.worker.on('failed', (job, error) => {
      this.logger.error({ msg: 'tâche planifiée en échec', task: job?.name ?? 'inconnue', err: error });
      if (job && job.attemptsMade >= QUEUES.scheduled.jobOptions.attempts) {
        this.reporter?.capture(error, { queue: QUEUE, task: job.name });
      }
    });
  }

  /** Planificateurs enregistrés (idempotent : une seule échéance par tâche, quel que soit le nombre de workers). */
  private async registerSchedulers(): Promise<void> {
    while (!this.stopped) {
      try {
        for (const task of this.tasks.values()) {
          await this.queue.upsertJobScheduler(
            task.name,
            { pattern: task.pattern, tz: TIMEZONE },
            { name: task.name, opts: QUEUES.scheduled.jobOptions },
          );
        }
        return;
      } catch (error) {
        this.logger.warn(`tâches planifiées non enregistrées, nouvel essai dans 5 s : ${(error as Error).message}`);
        await new Promise((resolve) => setTimeout(resolve, 5_000));
      }
    }
  }

  /** Déclenche une échéance (exploitation, tests) : un seul job par tâche et par échéance, quel que soit le worker. */
  async runNow(name: string, tick: string): Promise<void> {
    if (!this.tasks.has(name)) throw new Error(`tâche planifiée inconnue : ${name}`);
    await this.queue.add(name, {}, { jobId: `${name}-${tick.replace(/[^A-Za-z0-9_-]/g, '-')}` });
  }

  /** Exécute la tâche sous verrou ; `ignoré` si une exécution est déjà en cours ailleurs. */
  async executeWithLock(name: string): Promise<'exécuté' | 'ignoré'> {
    const task = this.tasks.get(name);
    if (!task) throw new Error(`tâche planifiée inconnue : ${name}`);
    const lock = `${REDIS_PREFIX}:lock:task:${name}`;
    const token = randomUUID();
    if ((await this.redis.set(lock, token, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
      this.logger.log(`tâche ${name} déjà en cours ailleurs : ignorée`);
      return 'ignoré';
    }
    try {
      await task.run();
      return 'exécuté';
    } finally {
      await this.redis.eval(RELEASE_LOCK, 1, lock, token);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    await this.worker?.close();
    // L'enregistrement en cours (Redis injoignable) n'est pas attendu : la fermeture de la file l'interrompt.
    await this.queue.close();
    void this.registration?.catch(() => undefined);
    this.redis.disconnect();
  }
}
