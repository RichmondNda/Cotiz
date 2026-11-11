/**
 * Canaux de notification (architecture/07). En V1, seuls `in_app` (cloche) et `manual` (message prêt remis par une
 * personne) existent : aucun fournisseur externe. Un canal absent ou désactivé est ignoré par le routeur, sans erreur.
 */
export const CHANNEL_KINDS = ['in_app', 'push', 'manual', 'email', 'sms'] as const;
export type ChannelKind = (typeof CHANNEL_KINDS)[number];

/** Qui lit la notification : elle n'apparaît que dans l'espace correspondant (`nt.list` : « espace courant »). */
export type Audience = 'subscriber' | 'manager' | 'platform';

/** Message rendu au moment de la création (titre et texte figés, schema.sql). */
export interface RenderedMessage {
  type: string;
  title: string;
  body: string;
  /** Route front exacte de l'écran d'action. */
  actionUrl: string | null;
  data?: Record<string, unknown>;
}

export interface Recipient {
  userId: string;
  /** Association concernée ; `null` pour une notification de plateforme. */
  associationId: string | null;
  audience: Audience;
}

export interface DeliveryResult {
  channel: ChannelKind;
  /** `created` : écrit ; `duplicate` : déjà fait (clé de déduplication) ; `prepared` : message prêt, aucun envoi. */
  status: 'created' | 'duplicate' | 'prepared';
  /** Ligne de la cloche créée (`in_app`, `created`) : annoncée au flux nt.stream après le COMMIT. */
  notificationId?: string;
}

export interface SendOptions {
  /** Unique par destinataire et par événement : rend l'envoi rejouable. */
  dedupeKey: string;
}

export interface NotificationChannel {
  readonly kind: ChannelKind;
  /** Configuration et fonctionnalités de l'association. */
  isEnabled(ctx: { associationId?: string | null }): Promise<boolean>;
  send(msg: RenderedMessage, recipient: Recipient, options: SendOptions): Promise<DeliveryResult>;
}

/** Jeton d'injection de la liste des canaux disponibles dans le processus. */
export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');
