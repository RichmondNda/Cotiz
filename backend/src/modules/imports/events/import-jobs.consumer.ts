import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ importId: z.uuid(), requestedBy: z.uuid().optional() });

/** Événement → job de la file `imports` (events.yaml : analyse, classement des lignes, exécution ligne par ligne). */
const JOB_OF = {
  'import.created': 'analyze',
  'import.mapped': 'classify',
  'import.commit_requested': 'execute',
} as const;

/** Consommateur `imports` : un job par événement (jobId), les cas d'usage écartent eux-mêmes un job périmé. */
@Injectable()
export class ImportJobsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) config: Config,
  ) {
    this.queue = new Queue(QUEUES.imports.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.imports.jobOptions,
    });
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'imports-jobs',
      types: Object.keys(JOB_OF) as (keyof typeof JOB_OF)[],
      ownTransactions: true,
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: EventEnvelope): Promise<void> {
    if (!event.associationId) return;
    const name = JOB_OF[event.type as keyof typeof JOB_OF];
    const { importId, requestedBy } = Payload.parse(event.payload);
    await this.queue.add(name, withTraceContext({ associationId: event.associationId, importId, requestedBy }), {
      jobId: `import-${name}-${event.id}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
