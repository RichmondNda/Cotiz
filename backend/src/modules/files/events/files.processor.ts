import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { Worker } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { runWithLogContext } from '../../../shared/logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { ScanFileUseCase } from '../application/scan-file.use-case.js';

const ScanJob = z.object({ fileId: z.uuid() });

/** Traitement de la file `files` : une analyse par job. */
@Injectable()
export class FilesProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(FilesProcessor.name);
  private worker: Worker | undefined;

  constructor(
    private readonly scan: ScanFileUseCase,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  onApplicationBootstrap(): void {
    const queue = QUEUES.files.name;
    this.worker = new Worker(
      queue,
      (job) => runWithLogContext({ queue, jobId: job.id }, () => this.scan.execute(ScanJob.parse(job.data).fileId)),
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: QUEUES.files.concurrency,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file files : ${error.message}`);
    });
    // Le fichier reste en attente (jamais « sain ») : l'échec doit se voir. Identifiant seulement, ni nom ni contenu.
    this.worker.on('failed', (job, error) => {
      const fileId = ScanJob.safeParse(job?.data).data?.fileId ?? 'inconnu';
      const attempts = `${String(job?.attemptsMade ?? 0)}/${String(QUEUES.files.jobOptions.attempts)}`;
      this.logger.error({ msg: 'analyse du fichier en échec', fileId, attempts, err: error });
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
