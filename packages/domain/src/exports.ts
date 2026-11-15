import { DomainError } from './errors.js';

// Exports asynchrones (rp.export, lot 4.6 ; quota retenu avec l'utilisateur le 2026-11-13, .claude/notes/decisions.md) :
// au plus un export en attente ou en cours par association, et 20 demandés par jour (jour local de l'association).
// Fichier conservé 7 jours (compartiment cotiz-exports, architecture/08).

export const EXPORT_LIMITS = { inProgress: 1, perDay: 20 } as const;
export const EXPORT_RETENTION_DAYS = 7;

const DAY_MS = 24 * 3600 * 1000;

const count = (name: string, value: number) => {
  if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { [name]: value });
  return value;
};

/**
 * Limite atteinte pour une nouvelle demande (`{ limit, usage }` : détails de `quota_exceeded`), sinon `null`.
 * `inProgress` : exports `queued` ou `running` de l'association ; `requestedToday` : exports demandés depuis le début
 * du jour local. La limite des exports en cours est signalée en premier.
 */
export function exportQuotaIssue(usage: {
  inProgress: number;
  requestedToday: number;
}): { limit: number; usage: number } | null {
  const inProgress = count('inProgress', usage.inProgress);
  const requestedToday = count('requestedToday', usage.requestedToday);
  if (inProgress >= EXPORT_LIMITS.inProgress) return { limit: EXPORT_LIMITS.inProgress, usage: inProgress };
  if (requestedToday >= EXPORT_LIMITS.perDay) return { limit: EXPORT_LIMITS.perDay, usage: requestedToday };
  return null;
}

/** Fin de disponibilité d'un fichier d'export produit à `producedAt`. */
export function exportExpiresAt(producedAt: Date): Date {
  return new Date(producedAt.getTime() + EXPORT_RETENTION_DAYS * DAY_MS);
}
