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
import { AnalyzeImportUseCase } from '../application/analyze-import.use-case.js';
import { ClassifyImportUseCase } from '../application/classify-import.use-case.js';
import { ExecuteImportUseCase } from '../application/execute-import.use-case.js';
import { FailImportUseCase } from '../application/fail-import.use-case.js';

const ImportJob = z.object({ associationId: z.uuid(), importId: z.uuid(), requestedBy: z.uuid().optional() });

/** Verrou d'association : posé pour 60 s, prolongé toutes les 20 s tant que le job tourne. */
const LOCK_TTL_MS = 60_000;
const LOCK_RENEW_MS = 20_000;
/** Job repris plus tard : association occupée par un autre job, fichier pas encore analysé par l'antivirus. */
const RETRY_DELAY_MS = 3_000;
const RENEW = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('pexpire', KEYS[1], ARGV[2]) else return 0 end`;
const RELEASE = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

/**
 * Traitement de la file `imports` (jobs.yaml : concurrence 1 par association) : plusieurs associations à la fois, une
 * seule tâche d'import par association (verrou Redis ; job occupé → différé, sans consommer de tentative). Jobs :
 * `analyze`, `classify`, `execute`. Échec définitif : import `failed` (`internal`), signalé.
 */
@Injectable()
export class ImportsProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ImportsProcessor.name);
  private readonly redis: Redis;
  private worker: Worker | undefined;

  constructor(
    private readonly analyze: AnalyzeImportUseCase,
    private readonly classify: ClassifyImportUseCase,
    private readonly executeImport: ExecuteImportUseCase,
    private readonly fail: FailImportUseCase,
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {
    this.redis = new Redis(config.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 3 });
    this.redis.on('error', (error: Error) => {
      this.logger.warn(`redis : ${error.message}`);
    });
  }

  onApplicationBootstrap(): void {
    const queue = QUEUES.imports.name;
    this.worker = new Worker(
      queue,
      (job, token) =>
        runWithLogContext({ queue, jobId: job.id }, () => traceJob(queue, job, () => this.process(job, token))),
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: QUEUES.imports.concurrency,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file imports : ${error.message}`);
    });
    // Identifiants seulement : ni nom de fichier, ni contenu de ligne.
    this.worker.on('failed', (job, error) => {
      if (error instanceof DelayedError) return;
      const attempts = `${String(job?.attemptsMade ?? 0)}/${String(QUEUES.imports.jobOptions.attempts)}`;
      this.logger.error({ msg: 'tâche d’import en échec', job: job?.name, jobId: job?.id, attempts, err: error });
      if (job && job.attemptsMade >= QUEUES.imports.jobOptions.attempts) {
        this.reporter?.capture(error, { queue, jobId: job.id ?? '' });
        const data = ImportJob.safeParse(job.data);
        if (data.success) {
          this.fail.execute(data.data).catch((e: unknown) => {
            this.logger.error({ msg: 'import non marqué en échec', jobId: job.id, err: e });
          });
        }
      }
    });
  }

  private async process(job: Job, token: string | undefined): Promise<void> {
    const data = ImportJob.parse(job.data);
    const lock = `${REDIS_PREFIX}:lock:imports:${data.associationId}`;
    const owner = randomUUID();
    if ((await this.redis.set(lock, owner, 'PX', LOCK_TTL_MS, 'NX')) !== 'OK') return this.later(job, token);
    const renew = setInterval(() => {
      this.redis.eval(RENEW, 1, lock, owner, String(LOCK_TTL_MS)).catch(() => undefined);
    }, LOCK_RENEW_MS);
    try {
      if (job.name === 'analyze') {
        if ((await this.analyze.execute(data)) === 'wait') return await this.later(job, token);
      } else if (job.name === 'classify') await this.classify.execute(data);
      else if (job.name === 'execute') {
        if (!data.requestedBy) throw new Error('import : exécution sans demandeur');
        await this.executeImport.execute({ ...data, requestedBy: data.requestedBy });
      } else throw new Error(`file imports : job inconnu ${job.name}`);
    } finally {
      clearInterval(renew);
      await this.redis.eval(RELEASE, 1, lock, owner).catch(() => undefined);
    }
  }

  /** Reprise différée, sans consommer de tentative (BullMQ : moveToDelayed + DelayedError). */
  private async later(job: Job, token: string | undefined): Promise<never> {
    await job.moveToDelayed(Date.now() + RETRY_DELAY_MS, token);
    throw new DelayedError();
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    this.redis.disconnect();
  }
}
