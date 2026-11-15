import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { DelayedError, type Job, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { runWithLogContext } from '../../../shared/logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { ErrorReporter, traceJob } from '../../../shared/telemetry/index.js';
import { FailExportUseCase } from '../application/fail-export.use-case.js';
import { GenerateExportUseCase } from '../application/generate-export.use-case.js';

const ExportJob = z.object({ associationId: z.uuid(), exportId: z.uuid() });

/** Verrou d'association : posé pour 60 s, prolongé toutes les 20 s tant que le job tourne. */
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_MS = 20_000;
/** Association occupée par un autre export : job repris plus tard, sans consommer de tentative. */
const RETRY_DELAY_MS = 3_000;
const RENEW = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Traitement de la file `exports` (jobs.yaml : concurrence 1 par association, lot 4.6) : plusieurs associations à la
 * fois, un seul export par association (verrou Redis ; occupée → différé). Échec définitif : export `failed`, signalé.
 * Identifiants seulement dans les journaux (ni nom de projet, ni contenu).
 */
@Injectable()
export class ExportsProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ExportsProcessor.name);
  private readonly redis: Redis;
  private worker: Worker | undefined;

  constructor(
    private readonly generate: GenerateExportUseCase,
    private readonly fail: FailExportUseCase,
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`redis : ${error.message}`);
    });
  }

  onApplicationBootstrap(): void {
    const queue = QUEUES.exports.name;
    this.worker = new Worker(
      queue,
      (job, token) =>
        runWithLogContext({ queue, jobId: job.id }, () => traceJob(queue, job, () => this.process(job, token))),
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: QUEUES.exports.concurrency,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file exports : ${error.message}`);
    });
    this.worker.on('failed', (job, error) => {
      if (error instanceof DelayedError) return;
      const attempts = `${String(job?.attemptsMade ?? 0)}/${String(QUEUES.exports.jobOptions.attempts)}`;
      this.logger.error({ msg: 'export en échec', jobId: job?.id, attempts, err: error });
      if (job && job.attemptsMade >= QUEUES.exports.jobOptions.attempts) {
        this.reporter?.capture(error, { queue, jobId: job.id ?? '' });
        const data = ExportJob.safeParse(job.data);
        if (data.success) {
          this.fail.execute(data.data).catch((e: unknown) => {
            this.logger.error({ msg: 'export non marqué en échec', jobId: job.id, err: e });
          });
        }
      }
    });
  }

  private async process(job: Job, token: string | undefined): Promise<void> {
    const data = ExportJob.parse(job.data);
    const lock = `${REDIS_PREFIX}:lock:exports:${data.associationId}`;
    const owner = randomUUID();
    if ((await this.redis.set(lock, owner, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') {
      await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
      throw new DelayedError();
    }
    const renew = setInterval(() => {
      this.redis.eval(RENEW, 1, lock, owner, String(LOCK_TTL_MS)).catch(() => undefined);
    }, LOCK_RENEW_MS);
    try {
      await this.generate.execute(data);
    } finally {
      clearInterval(renew);
      await this.redis.eval(RELEASE, 1, lock, owner).catch(() => undefined);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.redis.disconnect();
  }
}
