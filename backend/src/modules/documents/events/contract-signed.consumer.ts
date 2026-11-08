import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ signatureId: z.uuid() });

/** `contract.signed` → job `contract-pdf` de la file `documents` (events.yaml : « documents : PDF signé »). */
@Injectable()
export class ContractSignedConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly queue: Queue;
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    @Inject(CONFIG) config: Config,
  ) {
    this.queue = new Queue(QUEUES.documents.name, {
      connection: redisConnection(config.REDIS_URL),
      prefix: REDIS_PREFIX,
      defaultJobOptions: QUEUES.documents.jobOptions,
    });
  }

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'documents-contract-pdf',
      types: ['contract.signed'],
      handle: (event) => this.handle(event),
    });
  }

  /** Un job par événement (jobId) ; la génération elle-même ignore un PDF déjà produit. */
  async handle(event: EventEnvelope): Promise<void> {
    if (!event.associationId) return;
    const { signatureId } = Payload.parse(event.payload);
    await this.queue.add('contract-pdf', withTraceContext({ associationId: event.associationId, signatureId }), {
      jobId: `contract-pdf-${event.id}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
