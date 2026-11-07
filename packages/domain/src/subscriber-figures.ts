import type { IsoDate } from './dates.js';
import { DomainError } from './errors.js';
import type { EnrollmentStatus, InstallmentStatus, MemberStanding } from './ledger-types.js';
import type { InstallmentKind, ScheduleLine, ScheduleType } from './schedule.js';

// Espace souscripteur (me.dash, me.projects, me.project ; lot 3.2) : prochaine échéance et retard d'une inscription,
// synthèse toutes associations, ordre des cartes. Montants en entiers de la plus petite unité de la devise.

/** Échéance vue par l'espace souscripteur ; `status` : statut calculé (`installmentStatus`). */
export interface SubscriberInstallment {
  kind: InstallmentKind;
  sequence: number;
  dueDate: IsoDate;
  amountDue: number;
  amountPaid: number;
  amountPending: number;
  status: InstallmentStatus;
}

function checkAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
}

function check(i: SubscriberInstallment): void {
  checkAmount(i.amountDue);
  checkAmount(i.amountPaid);
  checkAmount(i.amountPending);
  if (i.amountPaid > i.amountDue) throw new DomainError('invalid_amount', { value: i.amountPaid });
}

function add(total: number, value: number): number {
  const sum = total + value;
  if (!Number.isSafeInteger(sum)) throw new DomainError('invalid_amount', { value: sum });
  return sum;
}

/** Date d'échéance, fonds d'entrée avant mensualité à date égale, puis rang (ordre de l'échéancier, § 4.2). */
function byDue(a: SubscriberInstallment, b: SubscriberInstallment): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
  if (a.kind !== b.kind) return a.kind === 'entry_fee' ? -1 : 1;
  return a.sequence - b.sequence;
}

/** Statuts d'une échéance à venir pour le souscripteur : ni en retard, ni couverte par une déclaration, ni close. */
const AHEAD: ReadonlySet<InstallmentStatus> = new Set(['upcoming', 'due', 'partial']);

const remainingOf = (i: SubscriberInstallment) => i.amountDue - i.amountPaid - i.amountPending;

/**
 * Prochaine échéance d'une inscription : la première (ordre de l'échéancier) à venir avec un reste dû, et ce reste
 * (`amountDue − amountPaid − amountPending`) ; `null` s'il n'y en a plus.
 */
export function enrollmentNextDue(
  installments: readonly SubscriberInstallment[],
): { dueDate: IsoDate; amount: number } | null {
  installments.forEach(check);
  const next = [...installments].sort(byDue).find((i) => AHEAD.has(i.status) && remainingOf(i) > 0);
  return next ? { dueDate: next.dueDate, amount: remainingOf(next) } : null;
}

/**
 * Retard d'une inscription : nombre d'échéances en retard, leur reste dû (`amountDue − amountPaid`, comme
 * `enrollmentTotals`) et la date d'échéance de la plus ancienne (« en retard depuis le 5 août ») ; `null` sans retard.
 */
export function enrollmentLate(
  installments: readonly SubscriberInstallment[],
): { count: number; amount: number; since: IsoDate } | null {
  installments.forEach(check);
  const late = installments.filter((i) => i.status === 'late').sort(byDue);
  const first = late[0];
  if (!first) return null;
  return {
    count: late.length,
    amount: late.reduce((total, i) => add(total, i.amountDue - i.amountPaid), 0),
    since: first.dueDate,
  };
}

export interface SubscriberEnrollmentFigures {
  status: EnrollmentStatus;
  remaining: number;
  late: { count: number; amount: number } | null;
  nextDue: { dueDate: IsoDate; amount: number } | null;
}

/** Une inscription qui engage : active ou terminée (ni en attente de signature, ni retirée). */
const engages = (status: EnrollmentStatus) => status === 'active' || status === 'completed';

function checkFigures(e: SubscriberEnrollmentFigures): void {
  checkAmount(e.remaining);
  if (e.late) {
    checkAmount(e.late.amount);
    if (!Number.isSafeInteger(e.late.count) || e.late.count < 1) {
      throw new DomainError('invalid_amount', { value: e.late.count });
    }
  }
  if (e.nextDue) checkAmount(e.nextDue.amount);
}

/**
 * Synthèse du tableau de bord souscripteur, toutes associations : reste dû et retard des inscriptions qui engagent,
 * et la position (`nextDueIndex`) de celle dont la prochaine échéance est la plus proche ; à date égale, la plus
 * grosse, puis la première donnée.
 */
export function subscriberSummary(enrollments: readonly SubscriberEnrollmentFigures[]): {
  remainingTotal: number;
  late: { count: number; amount: number } | null;
  nextDueIndex: number | null;
} {
  let remainingTotal = 0;
  let lateCount = 0;
  let lateAmount = 0;
  let nextDueIndex: number | null = null;
  let best: { dueDate: IsoDate; amount: number } | null = null;
  enrollments.forEach((e, index) => {
    checkFigures(e);
    if (!engages(e.status)) return;
    remainingTotal = add(remainingTotal, e.remaining);
    if (e.late) {
      lateCount = add(lateCount, e.late.count);
      lateAmount = add(lateAmount, e.late.amount);
    }
    const next = e.nextDue;
    if (
      next &&
      (!best || next.dueDate < best.dueDate || (next.dueDate === best.dueDate && next.amount > best.amount))
    ) {
      best = next;
      nextDueIndex = index;
    }
  });
  return { remainingTotal, late: lateCount > 0 ? { count: lateCount, amount: lateAmount } : null, nextDueIndex };
}

const standingRank = (standing: MemberStanding) =>
  standing === 'late' ? 0 : standing === 'signature_required' ? 1 : 2;

/**
 * Ordre des cartes projet du souscripteur (tableau de bord) : en retard, signature attendue, puis prochaine échéance
 * la plus proche (sans prochaine échéance : à la fin), puis projet le plus ancien (`createdAt` comparable en texte).
 */
export function bySubscriberCardOrder(
  a: { standing: MemberStanding; nextDueDate: IsoDate | null; createdAt: string },
  b: { standing: MemberStanding; nextDueDate: IsoDate | null; createdAt: string },
): number {
  const rank = standingRank(a.standing) - standingRank(b.standing);
  if (rank !== 0) return rank;
  if (a.nextDueDate !== b.nextDueDate) {
    if (a.nextDueDate === null) return 1;
    if (b.nextDueDate === null) return -1;
    return a.nextDueDate < b.nextDueDate ? -1 : 1;
  }
  return a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1;
}

/** Avancement d'une inscription : versé / engagement, plafonné à 1 ; `null` sans engagement (cycle roulant, 0). */
export function enrollmentProgress(paid: number, commitment: number | null): number | null {
  checkAmount(paid);
  if (commitment === null) return null;
  checkAmount(commitment);
  return commitment === 0 ? null : Math.min(1, paid / commitment);
}

/**
 * Inscription en attente de signature (décision 20 : échéancier généré à la signature) : ce qui compte pour son
 * engagement et son reste — à dates fixes, l'échéancier qui sera généré depuis la date d'entrée (`generateSchedule`),
 * rien de versé ni de déclaré, statut `upcoming` (aucun retard possible avant la signature) ; cycle roulant : aucun
 * terme, rien. À passer à `enrollmentTotals`.
 */
export function unsignedEnrollmentInstallments(
  schedule: readonly ScheduleLine[],
  scheduleType: ScheduleType,
): { amountDue: number; amountPaid: number; amountPending: number; status: InstallmentStatus }[] {
  if (scheduleType !== 'fixed') return [];
  return schedule.map((line) => {
    checkAmount(line.amountDue);
    return { amountDue: line.amountDue, amountPaid: 0, amountPending: 0, status: 'upcoming' as const };
  });
}
