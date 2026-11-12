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
  // Contrats (lot 4.1) : architecture/07 « Contrat signé » (in-app) ; à signer : consommateurs d'events.yaml.
  'contract.signature_required': { audience: 'subscriber', channels: ['in_app'] },
  'contract.locked': { audience: 'subscriber', channels: ['in_app'] },
  'contract.signed': { audience: 'manager', channels: ['in_app'] },
  // Imports (lot 4.4) : consommateur « notifications: gestionnaire » d'events.yaml.
  'import.completed': { audience: 'manager', channels: ['in_app'] },
  'import.failed': { audience: 'manager', channels: ['in_app'] },
} as const satisfies Partial<Record<EventType, MatrixEntry>>;

export type NotifiedEventType = keyof typeof NOTIFICATION_MATRIX;

/**
 * Notifications produites par une tâche planifiée, sans événement (jobs.yaml) : récapitulatif quotidien des
 * gestionnaires (`managers.digest`, lot 2.6), type `digest.daily` (préférence « Résumé quotidien » de MgProfil).
 */
export const JOB_NOTIFICATIONS = {
  'digest.daily': { audience: 'manager', channels: ['in_app'] },
} as const satisfies Record<string, MatrixEntry>;

export function matrixEntryOf(type: string): MatrixEntry | undefined {
  if (Object.hasOwn(NOTIFICATION_MATRIX, type)) return NOTIFICATION_MATRIX[type as NotifiedEventType];
  if (Object.hasOwn(JOB_NOTIFICATIONS, type)) return JOB_NOTIFICATIONS[type as keyof typeof JOB_NOTIFICATIONS];
  return undefined;
}

/**
 * Push urgents, envoyés même pendant les heures calmes (architecture/07 : 21 h – 8 h pour le « non urgent ») : une
 * personne bloquée qui attend la réponse (demande de réinitialisation). Le reste est différé à 8 h, jamais perdu.
 */
export const URGENT_PUSH_TYPES: ReadonlySet<string> = new Set(['password_reset.requested']);

/**
 * « Action requise » (décision du 2026-11-11, lot 4.2) : la cloche de ces types ne se coupe pas (interrupteur grisé) ;
 * leur push reste réglable. Les autres types se règlent par canal (`notification_preferences`, absent = activé).
 */
export const MANDATORY_IN_APP_TYPES: ReadonlySet<string> = new Set([
  'payment.rejected',
  'payment.reverted',
  'contract.signature_required',
  'installment.late',
  'association.suspended',
  'password_reset.requested',
]);

/** Canaux réglables par une personne pour ce type : ceux de la matrice parmi `in_app` et `push`. */
export function adjustableChannelsOf(type: string): ('in_app' | 'push')[] {
  const entry = matrixEntryOf(type);
  return (entry?.channels ?? []).filter((c): c is 'in_app' | 'push' => c === 'in_app' || c === 'push');
}

/** Types notifiés (événements et tâches), dans l'ordre de la matrice. */
export const NOTIFICATION_TYPES: readonly string[] = [
  ...Object.keys(NOTIFICATION_MATRIX),
  ...Object.keys(JOB_NOTIFICATIONS),
];
