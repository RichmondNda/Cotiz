import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { EventEnvelope } from '@cotiz/contracts';
import { payments } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { attachProofToAssociation } from '../../files/files.public.js';
import { EventConsumers } from '../../../shared/outbox/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/**
 * `payment.declared` (lot 3.3) : la preuve déposée par le souscripteur (sans association, la RLS lui interdit de la
 * rattacher) est rattachée à l'association du paiement, pour que ses gestionnaires la lisent (fl.get, lg.pay.get).
 * Paiement relu dans le contexte de son association, rattachement en espace system (deux transactions). Rejoué ou
 * preuve déjà rattachée : sans effet.
 */
@Injectable()
export class PaymentProofConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentProofConsumer.name);
  private unregister: (() => void) | undefined;

  constructor(
    private readonly consumers: EventConsumers,
    private readonly db: TenantDatabase,
  ) {}

  onModuleInit(): void {
    this.unregister = this.consumers.register({
      name: 'payment-proof',
      types: ['payment.declared'],
      ownTransactions: true,
      handle: (event) => this.handle(event),
    });
  }

  onModuleDestroy(): void {
    this.unregister?.();
  }

  private async handle(event: EventEnvelope): Promise<void> {
    const associationId = event.associationId;
    const paymentId = event.payload.paymentId;
    if (!associationId || typeof paymentId !== 'string') return;
    const [row] = await this.db.withTenantContext({ space: 'association', associationId }, () =>
      currentTx()
        .select({ proofFileId: payments.proofFileId, userId: payments.userId })
        .from(payments)
        .where(and(eq(payments.associationId, associationId), eq(payments.id, paymentId))),
    );
    const fileId = row?.proofFileId;
    if (!row || !fileId) return;
    const attached = await this.db.withTenantContext({ space: 'system' }, () =>
      attachProofToAssociation({ fileId, ownerUserId: row.userId, associationId }),
    );
    // Rejeu, ou preuve déjà rattachée (à cette association : sans suite ; à une autre : me.declare l'empêche).
    if (!attached) this.logger.log({ msg: 'preuve déjà rattachée ou introuvable', paymentId });
  }
}
