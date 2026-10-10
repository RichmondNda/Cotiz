import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { type JobType, Queue } from 'bullmq';
import { Gauge, type Registry } from 'prom-client';
import { CONFIG, type Config } from '../../config.js';
import { collectErrors, METRICS_REGISTRY, QUEUE_JOBS } from '../metrics/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from './index.js';

/** États exposés : file en retard (waiting, delayed), en cours, en échec (alerte « tâches en échec »). */
const STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'paused',
  'failed',
  'completed',
] as const satisfies JobType[];
/** Une file injoignable ne bloque pas le scrape au-delà. */
const COLLECT_TIMEOUT_MS = 2_000;

/** Tâches de chaque file BullMQ (docs/specs/jobs.yaml) par état, lues dans Redis à chaque scrape (worker). */
@Injectable()
export class QueueMetrics implements OnModuleDestroy {
  private readonly logger = new Logger(QueueMetrics.name);
  private readonly queues: Queue[];

  constructor(@Inject(METRICS_REGISTRY) registry: Registry, @Inject(CONFIG) config: Config) {
    this.queues = Object.values(QUEUES).map((q) => {
      const queue = new Queue(q.name, { connection: redisConnection(config.REDIS_URL), prefix: REDIS_PREFIX });
      queue.on(
        'error',
        AsyncLocalStorage.bind((error: Error) => {
          this.logger.warn(`file ${q.name} (métriques) : ${error.message}`);
        }),
      );
      return queue;
    });
    const errors = collectErrors(registry);
    const queues = this.queues;
    new Gauge({
      name: QUEUE_JOBS,
      help: 'Tâches BullMQ par file et par état',
      labelNames: ['queue', 'state'],
      registers: [registry],
      async collect() {
        this.reset();
        try {
          const counts = await Promise.race([
            Promise.all(queues.map(async (queue) => [queue.name, await queue.getJobCounts(...STATES)] as const)),
            new Promise<never>((_, reject) =>
              setTimeout(() => {
                reject(new Error('Redis injoignable'));
              }, COLLECT_TIMEOUT_MS).unref(),
            ),
          ]);
          for (const [queue, byState] of counts) {
            for (const state of STATES) this.set({ queue, state }, byState[state] ?? 0);
          }
        } catch {
          // Pas de valeur périmée : la série disparaît, l'échec est compté.
          errors.inc({ collector: 'queues' });
        }
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.queues.map((queue) => queue.close()));
  }
}

/** Métriques des files (worker). */
@Module({ providers: [QueueMetrics] })
export class QueueMetricsModule {}
