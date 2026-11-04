import type { EventType } from '@cotiz/contracts';
import type { Audience, ChannelKind } from './channel.js';

/**
 * Matrice par défaut (architecture/07, « Matrice par défaut » ; consommateurs « notifications: … » de
 * specs/events.yaml) : pour chaque événement notifié, qui le reçoit et par quels canaux. Le routeur n'utilise que les
 * canaux présents et actifs : en V1, `push` est ignoré jusqu'au lot 4.2. `manual` n'apparaît pas ici : les messages
 * prêts (codes, relances) sont rendus dans la réponse du cas d'usage, pas produits par un événement.
 * Un test vérifie que tout événement d'events.yaml (lot ≤ 2.5) consommé par « notifications » y figure.
 */
export interface MatrixEntry {
  /** Audience par défaut ; une demande de réinitialisation va aux gestionnaires ou à la plateforme selon l'espace. */
  audience: Audience | 'by-space';
  channels: readonly ChannelKind[];
}

export const NOTIFICATION_MATRIX = {
  'association.request_submitted': { audience: 'platform', channels: ['in_app', 'push'] },
  'association.suspended': { audience: 'manager', channels: ['in_app'] },
  'subscription.plan_changed': { audience: 'manager', channels: ['in_app'] },
  'user.activated': { audience: 'manager', channels: ['in_app'] },
  'password_reset.requested': { audience: 'by-space', channels: ['in_app', 'push'] },
  'member.enrolled': { audience: 'subscriber', channels: ['in_app', 'push'] },
  'member.withdrawn': { audience: 'subscriber', channels: ['in_app'] },
  'payment.declared': { audience: 'manager', channels: ['in_app', 'push'] },
  'payment.validated': { audience: 'subscriber', channels: ['in_app', 'push'] },
  'payment.rejected': { audience: 'subscriber', channels: ['in_app', 'push'] },
  'payment.reverted': { audience: 'subscriber', channels: ['in_app'] },
  'installment.due_soon': { audience: 'subscriber', channels: ['in_app', 'push'] },
  'installment.late': { audience: 'subscriber', channels: ['in_app', 'push'] },
} as const satisfies Partial<Record<EventType, MatrixEntry>>;

export type NotifiedEventType = keyof typeof NOTIFICATION_MATRIX;

export function matrixEntryOf(type: string): MatrixEntry | undefined {
  return Object.hasOwn(NOTIFICATION_MATRIX, type) ? NOTIFICATION_MATRIX[type as NotifiedEventType] : undefined;
}
