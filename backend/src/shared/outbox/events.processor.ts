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
import { EventEnvelope } from '@cotiz/contracts';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { CONFIG, type Config } from '../../config.js';
import { runWithLogContext } from '../logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../queues/index.js';
import { ErrorReporter, traceJob } from '../telemetry/index.js';
import { type TenantContext, TenantDatabase } from '../tenant-context/index.js';
import { EventConsumers } from './event-consumers.js';

/** Durée de la mémoire de déduplication `{eventId}:{consumer}` (architecture/05). */
const DEDUPE_TTL_SECONDS = 7 * 24 * 3600;
/** Verrou d'un consommateur en cours : un même événement n'est jamais traité deux fois en parallèle. */
const LOCK_TTL_MS = 5 * 60_000;

/** Libère le verrou seulement s'il est encore le nôtre (expiré puis repris par un autre worker sinon). */
const RELEASE_LOCK = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export const dedupeKey = (eventId: string, consumer: string) => `${REDIS_PREFIX}:dedupe:${eventId}:${consumer}`;

/**
 * File `events` (jobs.yaml : concurrence 10, 5 tentatives, backoff exponentiel). Pour chaque consommateur abonné au
 * type : déjà traité → ignoré ; sinon traitement dans une transaction du contexte de l'événement, puis marquage.
 * Un consommateur en échec fait reprendre le job ; ceux qui ont réussi ne sont pas rejoués.
 */
@Injectable()
export class EventsProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(EventsProcessor.name);
  private readonly redis: Redis;
  private worker: Worker | undefined;

  constructor(
    private readonly db: TenantDatabase,
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    // Lié au contexte du démarrage : une socket ouverte pendant un job garderait sinon le contexte de journal du job.
    this.redis.on(
      'error',
      AsyncLocalStorage.bind((error: Error) => {
        this.logger.warn(`redis : ${error.message}`);
      }),
    );
  }

  onApplicationBootstrap(): void {
    const queue = QUEUES.events.name;
    this.worker = new Worker(
      queue,
      (job) => runWithLogContext({ queue, jobId: job.id }, () => traceJob(queue, job, () => this.process(job.data))),
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: QUEUES.events.concurrency,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file events : ${error.message}`);
    });
    // Dernière tentative épuisée : signalée à GlitchTip (inactif sans DSN).
    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= QUEUES.events.jobOptions.attempts) {
        this.reporter?.capture(error, { queue: QUEUES.events.name, jobId: job.id ?? '' });
      }
    });
  }

  async process(raw: unknown): Promise<void> {
    const event = EventEnvelope.parse(raw);
    await runWithLogContext({ eventType: event.type, associationId: event.associationId }, () => this.dispatch(event));
  }

  private async dispatch(event: EventEnvelope): Promise<void> {
    const context: TenantContext = event.associationId
      ? { space: 'association', associationId: event.associationId }
      : { space: 'system' };
    const failures: unknown[] = [];
    for (const consumer of this.consumers.for(event.type)) {
      const done = dedupeKey(event.id, consumer.name);
      if ((await this.redis.exists(done)) === 1) continue;
      const lock = `${done}:lock`;
      const token = randomUUID();
      if ((await this.redis.set(lock, token, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
        failures.push(new Error(`${consumer.name} : événement ${event.id} déjà en cours de traitement`));
        continue;
      }
      try {
        await this.db.withTenantContext(context, () => consumer.handle(event));
        await this.redis.set(done, '1', 'EX', DEDUPE_TTL_SECONDS);
      } catch (error) {
        // Ni le contenu de l'événement ni ses identifiants personnels : type, id et consommateur suffisent.
        this.logger.warn({ msg: 'consommateur en échec', consumer: consumer.name, eventId: event.id, err: error });
        failures.push(error);
      } finally {
        await this.redis.eval(RELEASE_LOCK, 1, lock, token);
      }
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) throw new AggregateError(failures, `${String(failures.length)} consommateurs en échec`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.redis.disconnect();
  }
}
