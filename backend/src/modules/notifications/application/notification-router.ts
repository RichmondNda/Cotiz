import { Inject, Injectable } from '@nestjs/common';
import {
  type ChannelKind,
  type DeliveryResult,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type Recipient,
  type RenderedMessage,
} from '../domain/channel.js';
import { matrixEntryOf } from '../domain/matrix.js';

export interface RoutedDelivery extends DeliveryResult {
  recipient: Recipient;
}

/**
 * Routeur (architecture/07) : pour un message rendu et ses destinataires, envoie par chaque canal que la matrice prévoit
 * pour ce type. Un canal absent du processus (push avant le lot 4.2, email et SMS hors groupe 6) ou désactivé pour
 * l'association est ignoré silencieusement : aucun cas d'usage ne dépend de sa présence. Appelé dans la transaction de
 * l'espace system ouverte par le consommateur ; le canal in_app y écrit la ligne de la cloche.
 */
@Injectable()
export class NotificationRouter {
  private readonly channels: ReadonlyMap<ChannelKind, NotificationChannel>;

  constructor(@Inject(NOTIFICATION_CHANNELS) channels: readonly NotificationChannel[]) {
    this.channels = new Map(channels.map((c) => [c.kind, c]));
  }

  /**
   * `dedupeBase` : identifiant stable de l'occurrence (id de l'événement, ou clé de regroupement) ; la clé d'un envoi
   * est `{dedupeBase}:{userId}`, unique en base pour la cloche.
   */
  async dispatch(
    msg: RenderedMessage,
    recipients: readonly Recipient[],
    options: { dedupeBase: string },
  ): Promise<RoutedDelivery[]> {
    const entry = matrixEntryOf(msg.type);
    if (!entry) return [];
    const results: RoutedDelivery[] = [];
    const enabled = new Map<string, boolean>();
    for (const recipient of recipients) {
      for (const kind of entry.channels) {
        const channel = this.channels.get(kind);
        if (!channel) continue;
        const key = `${kind}:${recipient.associationId ?? ''}`;
        let on = enabled.get(key);
        if (on === undefined) {
          on = await channel.isEnabled({ associationId: recipient.associationId });
          enabled.set(key, on);
        }
        if (!on) continue;
        const result = await channel.send(msg, recipient, { dedupeKey: `${options.dedupeBase}:${recipient.userId}` });
        results.push({ ...result, recipient });
      }
    }
    return results;
  }
}
