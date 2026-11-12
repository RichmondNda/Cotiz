import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  type ChannelKind,
  type DeliveryResult,
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type Recipient,
  type RenderedMessage,
} from '../domain/channel.js';
import { notificationPreferences } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { MANDATORY_IN_APP_TYPES, matrixEntryOf } from '../domain/matrix.js';

/** Canaux coupés par les destinataires pour un type, sous la forme `userId:canal` (préférences, lot 4.2). */
export type DisabledChannelsReader = (type: string, recipients: readonly Recipient[]) => Promise<Set<string>>;
/** Jeton facultatif : lecture des préférences (par défaut en base, dans la transaction courante). */
export const DISABLED_CHANNELS = Symbol('DISABLED_CHANNELS');

export interface RoutedDelivery extends DeliveryResult {
  recipient: Recipient;
}

/**
 * Routeur (architecture/07) : pour un message rendu et ses destinataires, envoie par chaque canal que la matrice prévoit
 * pour ce type. Un canal absent du processus (push avant le lot 4.2, email et SMS hors groupe 6) ou désactivé pour
 * l'association est ignoré silencieusement : aucun cas d'usage ne dépend de sa présence. Préférences de la personne
 * (lot 4.2) : un canal coupé pour ce type est sauté, sauf la cloche d'un type « action requise » ; modèle de message du
 * canal (`variants`) substitué au texte du code. Appelé dans la transaction de
 * l'espace system ouverte par le consommateur ; le canal in_app y écrit la ligne de la cloche.
 */
@Injectable()
export class NotificationRouter {
  private readonly channels: ReadonlyMap<ChannelKind, NotificationChannel>;

  private readonly disabledChannels: DisabledChannelsReader;

  constructor(
    @Inject(NOTIFICATION_CHANNELS) channels: readonly NotificationChannel[],
    @Optional() @Inject(DISABLED_CHANNELS) disabled?: DisabledChannelsReader,
  ) {
    this.channels = new Map(channels.map((c) => [c.kind, c]));
    this.disabledChannels = disabled ?? readDisabledChannels;
  }

  /**
   * `dedupeBase` : identifiant stable de l'occurrence (id de l'événement, ou clé de regroupement) ; la clé d'un envoi
   * est `{dedupeBase}:{userId}`, unique en base pour la cloche. `channels` : restreint les canaux de la matrice (règle
   * de relance qui n'envoie que dans la cloche, lot 4.3) ; jamais un canal que la matrice n'a pas.
   */
  async dispatch(
    msg: RenderedMessage,
    recipients: readonly Recipient[],
    options: { dedupeBase: string; channels?: readonly ChannelKind[] },
  ): Promise<RoutedDelivery[]> {
    const entry = matrixEntryOf(msg.type);
    if (!entry) return [];
    const kinds = options.channels ? entry.channels.filter((k) => options.channels?.includes(k)) : entry.channels;
    const results: RoutedDelivery[] = [];
    const enabled = new Map<string, boolean>();
    const off = await this.disabledChannels(msg.type, recipients);
    for (const recipient of recipients) {
      let replayed = false;
      let notificationId: string | undefined;
      for (const kind of kinds) {
        // Cloche déjà écrite pour cette occurrence (événement rejoué) : les canaux externes ont déjà été servis.
        if (replayed) break;
        const channel = this.channels.get(kind);
        if (!channel) continue;
        // Préférence de la personne (lot 4.2) ; la cloche d'un type « action requise » ne se coupe pas.
        if (off.has(`${recipient.userId}:${kind}`) && !(kind === 'in_app' && MANDATORY_IN_APP_TYPES.has(msg.type))) {
          continue;
        }
        const key = `${kind}:${recipient.associationId ?? ''}`;
        let on = enabled.get(key);
        if (on === undefined) {
          on = await channel.isEnabled({ associationId: recipient.associationId });
          enabled.set(key, on);
        }
        if (!on) continue;
        const variant = kind === 'in_app' || kind === 'push' ? msg.variants?.[kind] : undefined;
        const result = await channel.send(variant ? { ...msg, ...variant } : msg, recipient, {
          dedupeKey: `${options.dedupeBase}:${recipient.userId}`,
          ...(notificationId ? { notificationId } : {}),
        });
        results.push({ ...result, recipient });
        if (kind === 'in_app' && result.status === 'duplicate') replayed = true;
        if (kind === 'in_app') notificationId = result.notificationId;
      }
    }
    return results;
  }
}

/** Lignes de la cloche créées par un envoi : compteurs à invalider et annonces au flux nt.stream, après le COMMIT. */
export function createdInApp(deliveries: readonly RoutedDelivery[]): { userId: string; notificationId: string }[] {
  return deliveries.flatMap((d) =>
    d.channel === 'in_app' && d.status === 'created' && d.notificationId
      ? [{ userId: d.recipient.userId, notificationId: d.notificationId }]
      : [],
  );
}

/** Suites des envois (mise en file des push), à exécuter après le COMMIT de la transaction qui les a écrits. */
export async function runAfterCommit(deliveries: readonly RoutedDelivery[]): Promise<void> {
  for (const d of deliveries) await d.afterCommit?.();
}

/** Canaux coupés par les destinataires pour ce type (`userId:canal`), lus dans la transaction system courante. */
export async function readDisabledChannels(type: string, recipients: readonly Recipient[]): Promise<Set<string>> {
  if (recipients.length === 0) return new Set();
  const rows = await currentTx()
    .select({ userId: notificationPreferences.userId, channel: notificationPreferences.channel })
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.type, type),
        eq(notificationPreferences.enabled, false),
        inArray(notificationPreferences.userId, [...new Set(recipients.map((r) => r.userId))]),
      ),
    );
  return new Set(rows.map((r) => `${r.userId}:${r.channel}`));
}
