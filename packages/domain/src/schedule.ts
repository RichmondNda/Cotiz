import { DomainError } from './errors.js';
import { addDays, addMonths, daysInMonth, formatIsoDate, isoWeekday, parseIsoDate } from './dates.js';
import type { IsoDate } from './dates.js';

// generateSchedule() : docs/specs/domain-rules.md § 2. Vecteurs normatifs : docs/specs/test-vectors/schedule.json.
// Montants en plus petite unité de la devise du projet (entiers) ; la devise est portée par l'appelant.

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';
export type ScheduleType = 'fixed' | 'rolling';
export type InstallmentKind = 'entry_fee' | 'periodic';

export interface ScheduleInput {
  installmentAmount: number;
  /** Fonds d'entrée ; 0, `null` ou absent = aucun. */
  entryFeeAmount?: number | null;
  frequency: Frequency;
  /** 1–31 (jour du mois) ; 1–7 (jour ISO) pour `weekly`. */
  dueDay: number;
  scheduleType: ScheduleType;
  startDate: IsoDate;
  /** Obligatoire pour `fixed`, ignorée pour `rolling`. `null` (colonne vide) = absente. */
  endDate?: IsoDate | null;
  /** Date d'entrée du souscripteur ; `startDate` par défaut. */
  enrolledFrom?: IsoDate | null;
  /** `rolling` : nombre d'échéances générées, 12 par défaut, 120 au plus (comme le contrat). */
  horizon?: number | null;
}

export interface ScheduleLine {
  /** Rang de la date dans le projet (identique pour tous les souscripteurs) ; 0 = fonds d'entrée. */
  sequence: number;
  kind: InstallmentKind;
  dueDate: IsoDate;
  amountDue: number;
}

const MONTH_STEP: Record<Exclude<Frequency, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};
const FREQUENCIES: readonly string[] = ['weekly', 'monthly', 'quarterly', 'semiannual', 'annual'];
const MAX_HORIZON = 120;
/** Années acceptées pour les dates d'entrée : borne la taille d'un échéancier et l'ordre des chaînes. */
const MIN_YEAR = 1900;
const MAX_YEAR = 2199;

function parseBounded(value: unknown): IsoDate {
  const { year } = parseIsoDate(value);
  if (year < MIN_YEAR || year > MAX_YEAR) throw new DomainError('invalid_date', { value });
  return value as IsoDate;
}

function validate(input: ScheduleInput): void {
  const { installmentAmount, entryFeeAmount, frequency, dueDay, scheduleType, horizon } = input;
  if (!Number.isSafeInteger(installmentAmount) || installmentAmount <= 0) {
    throw new DomainError('invalid_amount', { field: 'installmentAmount' });
  }
  if (entryFeeAmount != null && (!Number.isSafeInteger(entryFeeAmount) || entryFeeAmount < 0)) {
    throw new DomainError('invalid_amount', { field: 'entryFeeAmount' });
  }
  if (!FREQUENCIES.includes(frequency)) throw new DomainError('invalid_frequency', { frequency });
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > (frequency === 'weekly' ? 7 : 31)) {
    throw new DomainError('invalid_due_day', { dueDay });
  }
  // Entrées venues du JSON : la valeur peut sortir du type déclaré.
  if (!(['fixed', 'rolling'] as readonly string[]).includes(scheduleType)) {
    throw new DomainError('invalid_schedule_type', { scheduleType });
  }
  // Ordre du tableau de domain-rules § 2 : début, fin, puis date d'entrée et horizon.
  parseBounded(input.startDate);
  if (scheduleType === 'fixed') {
    if (input.endDate == null) throw new DomainError('end_date_required');
    parseBounded(input.endDate);
    if (input.endDate < input.startDate) throw new DomainError('end_before_start');
  }
  if (input.enrolledFrom != null) parseBounded(input.enrolledFrom);
  if (
    scheduleType === 'rolling' &&
    horizon != null &&
    (!Number.isInteger(horizon) || horizon < 1 || horizon > MAX_HORIZON)
  ) {
    throw new DomainError('invalid_horizon', { horizon });
  }
}

/** Dates périodiques du projet à partir de `startDate`, dans l'ordre (générateur infini). */
function* projectDates(input: ScheduleInput): Generator<IsoDate> {
  const { frequency, dueDay, startDate } = input;
  if (frequency === 'weekly') {
    let date = addDays(startDate, (dueDay - isoWeekday(startDate) + 7) % 7);
    for (;;) {
      yield date;
      date = addDays(date, 7);
    }
  }
  const start = parseIsoDate(startDate);
  for (let k = 0; ; k++) {
    const { year, month } = addMonths(start.year, start.month, k * MONTH_STEP[frequency]);
    const date = formatIsoDate({ year, month, day: Math.min(dueDay, daysInMonth(year, month)) });
    // Une date antérieure au début du projet est sautée (domain-rules § 2.1).
    if (date >= startDate) yield date;
  }
}

export function generateSchedule(input: ScheduleInput): ScheduleLine[] {
  validate(input);
  const from =
    input.enrolledFrom != null && input.enrolledFrom > input.startDate ? input.enrolledFrom : input.startDate;
  const horizon = input.horizon ?? 12;
  const end = input.scheduleType === 'fixed' ? input.endDate : null;
  const periodic: ScheduleLine[] = [];
  let sequence = 0;
  for (const dueDate of projectDates(input)) {
    if (end != null && dueDate > end) break;
    sequence += 1;
    // Aucune échéance rétroactive ; la numérotation du projet est conservée.
    if (dueDate < from) continue;
    periodic.push({ sequence, kind: 'periodic', dueDate, amountDue: input.installmentAmount });
    if (input.scheduleType === 'rolling' && periodic.length === horizon) break;
  }
  const first = periodic[0];
  if (!input.entryFeeAmount || !first) return periodic;
  return [{ sequence: 0, kind: 'entry_fee', dueDate: first.dueDate, amountDue: input.entryFeeAmount }, ...periodic];
}
