import { formatIsoDate, type IsoDate, parseIsoDate } from './dates.js';
import { DomainError } from './errors.js';
import type { EnrollmentStatus } from './ledger-types.js';

// Historique du souscripteur (me.history, lot 3.4) : versé, cumul et versé par mois, objectif. Montants en entiers de la
// plus petite unité de la devise.

/** Paiement validé de la sélection : `amount` = montant reçu (Σ de ses répartitions), `paidOn` = date du virement. */
export interface HistoryPayment {
  paidOn: IsoDate;
  projectId: string;
  amount: number;
}

/** Inscription de la sélection : `commitment` = engagement total (`enrollmentTotals`), `null` si ouvert. */
export interface HistoryCommitment {
  status: EnrollmentStatus;
  commitment: number | null;
}

export interface HistoryFigures {
  totalPaid: number;
  paymentsCount: number;
  /** Mois (premier jour) ayant au moins un versement, croissants ; `paid` = versé cumulé à la fin du mois. */
  cumulative: { month: IsoDate; paid: number }[];
  /** Mêmes mois ; projets triés par identifiant (ordre stable, indépendant de l'ordre reçu). */
  byMonth: { month: IsoDate; projects: { projectId: string; paid: number }[] }[];
  /** Σ des engagements des inscriptions qui engagent ; `null` si l'un est ouvert ou s'il n'y en a aucune. */
  target: number | null;
}

function checkAmount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new DomainError('invalid_amount', { value });
}

function add(total: number, value: number): number {
  const sum = total + value;
  if (!Number.isSafeInteger(sum)) throw new DomainError('invalid_amount', { value: sum });
  return sum;
}

const monthOf = (date: IsoDate): IsoDate => formatIsoDate({ ...parseIsoDate(date), day: 1 });

/** Une inscription qui engage : active ou terminée (comme `subscriberSummary`). */
const engages = (status: EnrollmentStatus) => status === 'active' || status === 'completed';

/**
 * Chiffres de l'historique : `payments` = paiements **validés** de la sélection (le versé est l'encaissé du
 * gestionnaire pour cette personne : à la validation, Σ répartitions = montant reçu), `enrollments` = inscriptions de
 * la sélection, pour l'objectif. `from` (période filtrée) : les versements antérieurs ne comptent ni dans le versé, ni
 * dans le nombre, ni dans les mois, mais le cumul part de leur somme (courbe cumulée depuis le début du projet,
 * décision du 2026-11-10).
 * Écart futur à surveiller : `enrollmentTotals` ne compte pas le versé d'une échéance dispensée ou annulée, ce total-ci
 * le compte. Sans effet tant qu'un retrait n'annule que des échéances sans versé et que la dispense n'existe pas
 * (décision n° 7, lot 4.3) ; à reprendre avec elle.
 */
export function subscriberHistoryFigures(
  payments: readonly HistoryPayment[],
  enrollments: readonly HistoryCommitment[],
  options: { from?: IsoDate } = {},
): HistoryFigures {
  if (options.from !== undefined) parseIsoDate(options.from);
  const months = new Map<IsoDate, Map<string, number>>();
  let totalPaid = 0;
  let paymentsCount = 0;
  let before = 0;
  for (const p of payments) {
    checkAmount(p.amount);
    parseIsoDate(p.paidOn);
    if (options.from !== undefined && p.paidOn < options.from) {
      before = add(before, p.amount);
      continue;
    }
    totalPaid = add(totalPaid, p.amount);
    paymentsCount += 1;
    const month = monthOf(p.paidOn);
    const projects = months.get(month) ?? new Map<string, number>();
    projects.set(p.projectId, add(projects.get(p.projectId) ?? 0, p.amount));
    months.set(month, projects);
  }
  const ordered = [...months.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  let running = before;
  const cumulative = ordered.map(([month, projects]) => {
    for (const paid of projects.values()) running = add(running, paid);
    return { month, paid: running };
  });
  const byMonth = ordered.map(([month, projects]) => ({
    month,
    projects: [...projects.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([projectId, paid]) => ({ projectId, paid })),
  }));

  let target: number | null = null;
  for (const e of enrollments) {
    if (e.commitment !== null) checkAmount(e.commitment);
    if (!engages(e.status)) continue;
    if (e.commitment === null) return { totalPaid, paymentsCount, cumulative, byMonth, target: null };
    target = add(target ?? 0, e.commitment);
  }
  return { totalPaid, paymentsCount, cumulative, byMonth, target };
}
