import type { IsoDate } from './dates.js';
import { DomainError } from './errors.js';
import type { InstallmentStatus } from './ledger-types.js';
import type { InstallmentKind } from './schedule.js';

// Chiffres de collecte d'un ensemble d'échéances (projet, inscription, association) : rapport de projet, tableau de bord
// gestionnaire (lot 2.6). Montants en plus petite unité de la devise (entiers) ; la devise est portée par l'appelant.

/** Ce que la collecte lit d'une échéance ; `status` : statut calculé (`installmentStatus`). */
export interface CollectionInstallment {
  kind: InstallmentKind;
  sequence: number;
  dueDate: IsoDate;
  amountDue: number;
  amountPaid: number;
  status: InstallmentStatus;
}

export interface CollectionFigures {
  /** Attendu à date : dû des échéances qui comptent, échues au jour donné (dues ce jour comprises). */
  expectedToDate: number;
  /** Versé sur ces échéances échues. */
  recoveredToDate: number;
  /**
   * Encaissé : tout le versé, versements anticipés et échéances annulées ou dispensées compris (= Σ des allocations
   * confirmées) — ce qui a été reçu reste reçu.
   */
  received: number;
  /** Reste dû à date : attendu − recouvré. */
  remainingToDate: number;
  /** Échéances en retard et leur reste dû. */
  lateCount: number;
  lateAmount: number;
  /** Recouvré / attendu, entre 0 et 1 ; `null` si rien n'est encore attendu. */
  recoveryRate: number | null;
}

/** Période d'un rapport : échéances dont la date tombe dans [from, to] (bornes facultatives, comprises). */
export interface CollectionPeriod {
  from?: IsoDate | undefined;
  to?: IsoDate | undefined;
}

/** L'échéance de cette date entre-t-elle dans la période ? */
export function inCollectionPeriod(dueDate: IsoDate, period: CollectionPeriod = {}): boolean {
  return (!period.from || dueDate >= period.from) && (!period.to || dueDate <= period.to);
}

/** Une échéance annulée ou dispensée n'est plus attendue (comme `enrollmentTotals`). */
const counts = (i: CollectionInstallment) => i.status !== 'canceled' && i.status !== 'waived';

function add(total: number, value: number): number {
  const sum = total + value;
  if (!Number.isSafeInteger(sum)) throw new DomainError('invalid_amount', { value: sum });
  return sum;
}

function check(i: CollectionInstallment): void {
  for (const value of [i.amountDue, i.amountPaid]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
  }
  if (i.amountPaid > i.amountDue) throw new DomainError('invalid_amount', { value: i.amountPaid });
}

const rate = (recovered: number, expected: number): number | null => (expected > 0 ? recovered / expected : null);

export function collectionFigures(installments: readonly CollectionInstallment[], today: IsoDate): CollectionFigures {
  let expectedToDate = 0;
  let recoveredToDate = 0;
  let received = 0;
  let lateCount = 0;
  let lateAmount = 0;
  for (const i of installments) {
    check(i);
    received = add(received, i.amountPaid);
    if (!counts(i)) continue;
    if (i.dueDate <= today) {
      expectedToDate = add(expectedToDate, i.amountDue);
      recoveredToDate = add(recoveredToDate, i.amountPaid);
    }
    if (i.status === 'late') {
      lateCount += 1;
      lateAmount = add(lateAmount, i.amountDue - i.amountPaid);
    }
  }
  return {
    expectedToDate,
    recoveredToDate,
    received,
    remainingToDate: expectedToDate - recoveredToDate,
    lateCount,
    lateAmount,
    recoveryRate: rate(recoveredToDate, expectedToDate),
  };
}

/**
 * Attendu et versé par rang d'échéance périodique (fonds d'entrée et échéances annulées ou dispensées exclus), dans
 * l'ordre des rangs. Cycle roulant : rang commun, date la plus ancienne du rang.
 */
export function collectionBySequence(
  installments: readonly CollectionInstallment[],
): { sequence: number; dueDate: IsoDate; expected: number; received: number }[] {
  const bySequence = new Map<number, { sequence: number; dueDate: IsoDate; expected: number; received: number }>();
  for (const i of installments) {
    check(i);
    if (i.kind !== 'periodic' || !counts(i)) continue;
    const entry = bySequence.get(i.sequence) ?? { sequence: i.sequence, dueDate: i.dueDate, expected: 0, received: 0 };
    if (i.dueDate < entry.dueDate) entry.dueDate = i.dueDate;
    entry.expected = add(entry.expected, i.amountDue);
    entry.received = add(entry.received, i.amountPaid);
    bySequence.set(i.sequence, entry);
  }
  return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
}

/**
 * Taux de recouvrement cumulé après chaque date d'échéance périodique échue : versé / dû des échéances qui comptent,
 * échues à cette date (fonds d'entrée compris). Une date sans rien d'attendu est omise. Une passe sur les échéances
 * triées par date.
 */
export function recoveryRateBySequence(
  installments: readonly CollectionInstallment[],
  today: IsoDate,
): { dueDate: IsoDate; rate: number }[] {
  installments.forEach(check);
  const live = installments.filter((i) => counts(i) && i.dueDate <= today);
  const periodicDates = new Set(live.filter((i) => i.kind === 'periodic').map((i) => i.dueDate));
  const sorted = [...live].sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const points: { dueDate: IsoDate; rate: number }[] = [];
  let expected = 0;
  let recovered = 0;
  sorted.forEach((i, k) => {
    expected = add(expected, i.amountDue);
    recovered = add(recovered, i.amountPaid);
    const next = sorted[k + 1];
    const lastOfDate = next?.dueDate !== i.dueDate;
    if (!lastOfDate || !periodicDates.has(i.dueDate)) return;
    const value = rate(recovered, expected);
    if (value !== null) points.push({ dueDate: i.dueDate, rate: value });
  });
  return points;
}
