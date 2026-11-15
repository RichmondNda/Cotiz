import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { REVERT_WINDOW_MS } from '@cotiz/domain';
import { Queue } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { withTraceContext } from '../../../shared/telemetry/index.js';

const Payload = z.object({ paymentId: z.uuid() });

/** Marge après le délai d'annulation : la validation est datée par la base, le job par l'horloge du worker. */
export const RECEIPT_DELAY_MS = REVERT_WINDOW_MS + 60_000;

/**
 * `payment.validated` → job `receipt-pdf` de la file `documents`, différé au-delà du délai d'annulation (events.yaml :
 * « documents : reçu PDF »). Un job par événement (jobId) : une validation annulée puis refaite en ajoute un, la
 * génération ne produit qu'un reçu par paiement.
 */
@Injectable()
export class PaymentValidatedConsumer implements OnModuleInit, OnModuleDestroy {
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
      name: 'documents-receipt-pdf',
      types: ['payment.validated'],
      handle: (event) => this.handle(event),
    });
  }

  async handle(event: EventEnvelope): Promise<void> {
    const { paymentId } = Payload.parse(event.payload);
    // L'association de l'enveloppe fait foi (le paiement est relu dans son contexte).
    if (!event.associationId) return;
    await this.queue.add('receipt-pdf', withTraceContext({ associationId: event.associationId, paymentId }), {
      jobId: `receipt-pdf-${event.id}`,
      delay: RECEIPT_DELAY_MS,
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.unregister?.();
    await this.queue.close();
  }
}
