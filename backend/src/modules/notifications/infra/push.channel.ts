import { Inject, Injectable } from '@nestjs/common';
import { deliveries, pushSubscriptions } from '@cotiz/db';
import { quietHoursDelayMs } from '@cotiz/domain';
import { and, count, eq, isNull } from 'drizzle-orm';
import { associationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type {
  DeliveryResult,
  NotificationChannel,
  Recipient,
  RenderedMessage,
  SendOptions,
} from '../domain/channel.js';
import { URGENT_PUSH_TYPES } from '../domain/matrix.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';
import { PushQueue } from './push-queue.js';

/** Fuseau d'une notification de plateforme (sans association) : celui des associations par défaut (schema.sql). */
const DEFAULT_TIMEZONE = 'Africa/Abidjan';

/**
 * Canal `push` (lot 4.2, architecture/07) : Web Push standard, actif dès que les clés VAPID sont configurées. Dans la
 * transaction du consommateur (espace system) : une ligne `deliveries` par destinataire qui a au moins un appareil
 * abonné ; la mise en file `notify-push` vient après le COMMIT (`afterCommit`), différée hors 8 h – 21 h locale pour un
 * type non urgent. Aucun appareil : rien n'est écrit (`skipped`).
 */
@Injectable()
export class PushChannel implements NotificationChannel {
  readonly kind = 'push' as const;

  constructor(
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly queue: PushQueue,
  ) {}

  isEnabled(): Promise<boolean> {
    return Promise.resolve(this.sender.configured);
  }

  async send(msg: RenderedMessage, recipient: Recipient, options: SendOptions): Promise<DeliveryResult> {
    const tx = currentTx();
    const [devices] = await tx
      .select({ n: count() })
      .from(pushSubscriptions)
      .where(and(eq(pushSubscriptions.userId, recipient.userId), isNull(pushSubscriptions.revokedAt)));
    const n = devices?.n ?? 0;
    if (n === 0) return { channel: this.kind, status: 'skipped' };

    const [row] = await tx
      .insert(deliveries)
      .values({
        userId: recipient.userId,
        associationId: recipient.associationId,
        notificationId: options.notificationId ?? null,
        channel: 'push',
        provider: 'webpush',
        // Jamais l'URL d'un appareil (elle vaut accès à l'appareil) : le nombre seulement.
        recipientMasked: `${String(n)} appareil${n > 1 ? 's' : ''}`,
        status: 'queued',
      })
      .returning({ id: deliveries.id });
    if (!row) throw new Error('canal push : envoi non enregistré');

    const urgent = URGENT_PUSH_TYPES.has(msg.type);
    const delay = urgent ? 0 : quietHoursDelayMs(new Date(), await this.timezoneOf(recipient.associationId));
    const job = {
      deliveryId: row.id,
      userId: recipient.userId,
      urgent,
      payload: { title: msg.title, body: msg.body, url: msg.actionUrl, tag: msg.type },
    };
    // BullMQ refuse « : » dans un jobId personnalisé.
    const jobId = `push-${options.dedupeKey.replaceAll(':', '_')}`;
    return { channel: this.kind, status: 'queued', afterCommit: () => this.queue.add(job, { jobId, delay }) };
  }

  private async timezoneOf(associationId: string | null): Promise<string> {
    if (!associationId) return DEFAULT_TIMEZONE;
    return (await associationTimezonesOf([associationId])).get(associationId) ?? DEFAULT_TIMEZONE;
  }
}
