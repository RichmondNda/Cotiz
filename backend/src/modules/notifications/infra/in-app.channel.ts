import { Injectable } from '@nestjs/common';
import { notifications } from '@cotiz/db';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type {
  DeliveryResult,
  NotificationChannel,
  Recipient,
  RenderedMessage,
  SendOptions,
} from '../domain/channel.js';

/**
 * Canal `in_app` (lot 2.5) : une ligne `notifications`, lue par la cloche. Toujours actif, aucun fournisseur. Écrit
 * dans la transaction courante (espace system, ouverte par le consommateur) ; une clé de déduplication déjà vue ne
 * crée rien (événement rejoué). Le compteur de non-lus est invalidé par l'appelant après le COMMIT.
 */
@Injectable()
export class InAppChannel implements NotificationChannel {
  readonly kind = 'in_app' as const;

  isEnabled(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async send(msg: RenderedMessage, recipient: Recipient, options: SendOptions): Promise<DeliveryResult> {
    const created = await currentTx()
      .insert(notifications)
      .values({
        userId: recipient.userId,
        associationId: recipient.associationId,
        type: msg.type,
        title: msg.title,
        body: msg.body,
        actionUrl: msg.actionUrl,
        data: { ...msg.data, audience: recipient.audience },
        dedupeKey: options.dedupeKey,
      })
      .onConflictDoNothing({ target: notifications.dedupeKey })
      .returning({ id: notifications.id });
    const [row] = created;
    return row
      ? { channel: this.kind, status: 'created', notificationId: row.id }
      : { channel: this.kind, status: 'duplicate' };
  }
}
