import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ fileId: z.uuid() });

/** file.uploaded → job d'analyse dans la file `files` (jobs.yaml : concurrence 4, 3 tentatives). */
@Injectable()
export class FileUploadedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) config: Config,
  ) {
    this.queue = new Queue(QUEUES.files.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.files.jobOptions,
    });
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'files-scan',
      types: ['file.uploaded'],
      handle: async (event) => {
        const { fileId } = Payload.parse(event.payload);
        // Un job par événement : l'analyse elle-même ignore un fichier déjà analysé.
        // Le traitement de l'analyse poursuit la trace du traitement de l'événement.
        await this.queue.add('scan', withTraceContext({ fileId }), { jobId: `scan-${event.id}` });
      },
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
