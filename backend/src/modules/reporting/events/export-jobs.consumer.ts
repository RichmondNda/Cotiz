import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ exportId: z.uuid() });

/**
 * Consommateur « reporting: file exports » d'`export.requested` (events.yaml, lot 4.6) : un job `export` par
 * événement (jobId : un second relais du même événement est écarté) ; association de l'enveloppe exigée.
 */
@Injectable()
export class ExportJobsConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) config: Config,
  ) {
    this.queue = new Queue(QUEUES.exports.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.exports.jobOptions,
    });
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'reporting-exports',
      types: ['export.requested'],
      ownTransactions: true,
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: EventEnvelope): Promise<void> {
    if (!event.associationId) return;
    const { exportId } = Payload.parse(event.payload);
    await this.queue.add('export', withTraceContext({ associationId: event.associationId, exportId }), {
      jobId: `export-${event.id}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
