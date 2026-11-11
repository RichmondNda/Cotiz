import { DomainError } from './errors.js';
import { addDays, parseIsoDate } from './dates.js';
import type { IsoDate } from './dates.js';
import type { EnrollmentStatus, InstallmentState, InstallmentStatus, MemberStanding } from './ledger-types.js';

// Statuts : domain-rules.md § 6 (échéance) et § 7 (situation d'un souscripteur). Vecteurs : status.json.

/** Au-delà, une saisie est certainement erronée (et les dates sortiraient du calendrier pris en charge). */
const MAX_GRACE_DAYS = 365;

function assertGraceDays(graceDays: number): void {
  if (!Number.isInteger(graceDays) || graceDays < 0 || graceDays > MAX_GRACE_DAYS) {
    throw new DomainError('invalid_grace_days', { graceDays });
  }
}

/**
 * Date du jour dans le fuseau de l'association (`Africa/Abidjan` par défaut, domain-rules § 6), commune au front
 * et au back : jamais `new Date().toISOString().slice(0, 10)`, faux hors UTC entre minuit UTC et minuit local.
 */
export function todayIn(timeZone = 'Africa/Abidjan', now: Date = new Date()): IsoDate {
  // `en-CA` formate en `YYYY-MM-DD`.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Heure (0–23) dans le fuseau de l'association à l'instant `now` : tâches quotidiennes « à 01:00 locale ». */
export function hourIn(timeZone: string, now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number.parseInt(hour, 10);
}

/** Minutes écoulées depuis minuit (0–1439) dans le fuseau de l'association à l'instant `now`. */
export function minutesIn(timeZone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return Number.parseInt(parts.hour ?? '0', 10) * 60 + Number.parseInt(parts.minute ?? '0', 10);
}

/** Heure locale du récapitulatif gestionnaire (jobs.yaml, managers.digest : quotidienne 07:30 locale). */
export const MANAGERS_DIGEST_MINUTES = 7 * 60 + 30;

/** Est-il 07:30 ou plus tard (jusqu'à minuit) dans le fuseau de l'association ? Rattrapage dans la journée. */
export function isManagersDigestTime(timeZone: string, now: Date): boolean {
  return minutesIn(timeZone, now) >= MANAGERS_DIGEST_MINUTES;
}

/** Rappel « échéance dans 3 jours » (jobs.yaml, installments.due-soon ; architecture/07). */
export const DUE_SOON_DAYS = 3;

/** Date d'échéance visée par le rappel du jour `today` (jour de l'association) : `today` + 3 jours. */
export function dueSoonDate(today: IsoDate): IsoDate {
  parseIsoDate(today);
  return addDays(today, DUE_SOON_DAYS);
}

/**
 * Départ du retard : l'échéance, ou `lateFrom` s'il est postérieur (échéance déjà passée à la signature du contrat,
 * domain-rules § 6). Les vecteurs status.json, sans `lateFrom`, valent `null`.
 */
export function lateStart(installment: Pick<InstallmentState, 'dueDate'> & { lateFrom?: IsoDate | null }): IsoDate {
  parseIsoDate(installment.dueDate);
  const from = installment.lateFrom ?? null;
  if (from === null) return installment.dueDate;
  parseIsoDate(from);
  return from > installment.dueDate ? from : installment.dueDate;
}

/** Premier jour de retard : départ du retard (lateStart) + délai de grâce + 1 jour. */
export function lateSince(
  installment: Pick<InstallmentState, 'dueDate'> & { lateFrom?: IsoDate | null },
  graceDays: number,
): IsoDate {
  assertGraceDays(graceDays);
  return addDays(lateStart(installment), graceDays + 1);
}

/**
 * Départ du retard (lateStart : échéance, ou `late_from` s'il est postérieur) dont le premier jour de retard est `today`
 * (inverse de lateSince) : `today` − (délai de grâce + 1).
 */
export function dueDateTurningLateOn(today: IsoDate, graceDays: number): IsoDate {
  assertGraceDays(graceDays);
  return addDays(today, -(graceDays + 1));
}

/**
 * Date de retard à persister (`installments.late_since`) au jour `today` : un fait daté, pas un statut. Posée dès que
 * le délai de grâce est dépassé tant que l'échéance n'est ni soldée, ni dispensée, ni annulée, même si son statut
 * affiché est `declared` (décision du lot 2.4) ; une validation annulée rend donc la date d'avant. Sinon `null`.
 */
export function lateSinceOf(installment: InstallmentState, today: IsoDate, graceDays: number): IsoDate | null {
  const status = installmentStatus(installment, today, graceDays);
  if (status === 'paid' || status === 'waived' || status === 'canceled') return null;
  const since = lateSince(installment, graceDays);
  return today >= since ? since : null;
}

/**
 * Statut d'une échéance au jour `today` (date dans le fuseau de l'association). Le premier cas qui s'applique gagne :
 * waived/canceled persistés, paid, declared, late, partial, due, upcoming.
 */
export function installmentStatus(installment: InstallmentState, today: IsoDate, graceDays: number): InstallmentStatus {
  parseIsoDate(today);
  parseIsoDate(installment.dueDate);
  assertGraceDays(graceDays);
  const { amountDue, amountPaid, amountPending, status } = installment;
  for (const value of [amountDue, amountPaid, amountPending]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
  }

  if (status === 'waived' || status === 'canceled') return status;
  if (amountPaid >= amountDue) return 'paid';
  if (amountPending > 0) return 'declared';
  if (today >= lateSince(installment, graceDays)) return 'late';
  if (amountPaid > 0) return 'partial';
  if (today >= installment.dueDate) return 'due';
  return 'upcoming';
}

/**
 * Situation d'un souscripteur sur un projet (§ 7). `installmentStatuses` : statuts *calculés* (`installmentStatus`),
 * le `late` persisté n'étant mis à jour que par la tâche quotidienne. `activation_pending` est calculé par le back à
 * partir du compte ; sa priorité face à `signature_required` n'est pas fixée par la spec.
 */
export function memberStanding(
  enrollmentStatus: EnrollmentStatus,
  installmentStatuses: readonly InstallmentStatus[],
): Exclude<MemberStanding, 'activation_pending'> {
  switch (enrollmentStatus) {
    case 'pending_signature':
      return 'signature_required';
    case 'withdrawn':
      return 'withdrawn';
    case 'active':
    case 'completed':
      return installmentStatuses.includes('late') ? 'late' : 'up_to_date';
    default:
      throw new DomainError('invalid_status', { enrollmentStatus });
  }
}

/** Du plus grave au moins grave : « le pire de ses projets » (annuaire, fiche). */
const STANDING_SEVERITY: readonly MemberStanding[] = [
  'late',
  'signature_required',
  'activation_pending',
  'up_to_date',
  'withdrawn',
];

/**
 * Situation globale d'un souscripteur dans une association : la plus grave de ses inscriptions (`memberStanding`, plus
 * `activation_pending` posé par le back). Retiré seulement s'il l'est de tous ses projets.
 */
export function overallStanding(standings: readonly MemberStanding[]): MemberStanding {
  const worst = STANDING_SEVERITY.find((standing) => standings.includes(standing));
  if (!worst) throw new DomainError('invalid_status', { standings: [...standings] });
  return worst;
}
