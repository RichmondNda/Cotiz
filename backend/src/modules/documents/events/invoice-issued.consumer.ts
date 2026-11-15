import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ invoiceId: z.uuid(), associationId: z.uuid() });

/** `subscription.invoice_issued` → job `invoice-pdf` de la file `documents` (events.yaml : « documents : PDF facture »). */
@Injectable()
export class InvoiceIssuedConsumer implements OnModuleInit, OnModuleDestroy {
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
      name: 'documents-invoice-pdf',
      types: ['subscription.invoice_issued'],
      handle: (event) => this.handle(event),
    });
  }

  /** Un job par événement (jobId) ; la génération elle-même ignore un PDF déjà produit. */
  async handle(event: EventEnvelope): Promise<void> {
    const { invoiceId, associationId } = Payload.parse(event.payload);
    // L'association de l'enveloppe fait foi : une charge utile qui en désignerait une autre est ignorée.
    if (event.associationId !== associationId) return;
    await this.queue.add('invoice-pdf', withTraceContext({ associationId, invoiceId }), {
      jobId: `invoice-pdf-${event.id}`,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
