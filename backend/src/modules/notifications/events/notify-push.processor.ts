import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { type Job, Worker } from 'bullmq';
import { CONFIG, type Config } from '../../../config.js';
import { runWithLogContext } from '../../../shared/logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { ErrorReporter, traceJob } from '../../../shared/telemetry/index.js';
import { PushRetryableError, SendPushUseCase } from '../application/send-push.use-case.js';
import { PushJob } from '../infra/push-queue.js';

const SPEC = QUEUES['notify-push'];

/** Traitement de la file `notify-push` (concurrence 10, 3 tentatives) : un envoi Web Push par job. */
@Injectable()
export class NotifyPushProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(NotifyPushProcessor.name);
  private worker: Worker | undefined;

  constructor(
    private readonly sendPush: SendPushUseCase,
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {}

  onApplicationBootstrap(): void {
    const queue = SPEC.name;
    this.worker = new Worker(
      queue,
      (job) => runWithLogContext({ queue, jobId: job.id }, () => traceJob(queue, job, () => this.process(job))),
      { connection: redisConnection(this.config.REDIS_URL), prefix: REDIS_PREFIX, concurrency: SPEC.concurrency },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file notify-push : ${error.message}`);
    });
    // Identifiants et raisons seulement : jamais l'URL d'un appareil ni le contenu du message.
    this.worker.on('failed', (job, error) => {
      const attempts = `${String(job?.attemptsMade ?? 0)}/${String(SPEC.jobOptions.attempts)}`;
      const reasons = error instanceof PushRetryableError ? error.reasons : undefined;
      this.logger.warn({ msg: 'envoi push en échec', jobId: job?.id, attempts, reasons });
      if (!(error instanceof PushRetryableError) && job && job.attemptsMade >= SPEC.jobOptions.attempts) {
        this.reporter?.capture(error, { queue, jobId: job.id ?? '' });
      }
    });
  }

  private async process(job: Job): Promise<void> {
    if (job.name !== 'send') throw new Error(`file notify-push : job inconnu ${job.name}`);
    await this.sendPush.execute(PushJob.parse(job.data), { final: job.attemptsMade + 1 >= SPEC.jobOptions.attempts });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
