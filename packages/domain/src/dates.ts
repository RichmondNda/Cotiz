import { DomainError } from './errors.js';

// Dates civiles `YYYY-MM-DD`, sans fuseau ni objet Date : arithmétique sur le numéro de jour (algorithme
// « days from civil » de H. Hinnant). L'ordre lexicographique des chaînes est l'ordre chronologique.

export type IsoDate = string;
export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

export function daysInMonth(year: number, month: number): number {
  return month === 2 ? (isLeap(year) ? 29 : 28) : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseIsoDate(value: unknown): CivilDate {
  if (!isIsoDate(value)) throw new DomainError('invalid_date', { value });
  const [year, month, day] = value.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function formatIsoDate({ year, month, day }: CivilDate): IsoDate {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Numéro de jour depuis le 1970-01-01. */
function toDayNumber({ year, month, day }: CivilDate): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromDayNumber(n: number): CivilDate {
  const z = n + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatIsoDate(fromDayNumber(toDayNumber(parseIsoDate(date)) + days));
}

/** Jour ISO : 1 = lundi … 7 = dimanche. */
export function isoWeekday(date: IsoDate): number {
  // Le 1970-01-01 était un jeudi (4).
  return ((((toDayNumber(parseIsoDate(date)) + 3) % 7) + 7) % 7) + 1;
}

/** Mois décalé de `months` (année et mois seulement). */
export function addMonths(year: number, month: number, months: number): { year: number; month: number } {
  const index = year * 12 + (month - 1) + months;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}
