import { addDays, type IsoDate, parseIsoDate } from './dates.js';
import { hourIn, todayIn } from './status.js';

// Statistiques d'usage (usage_daily, lot 4.6) : une ligne par association et par jour local, calculée par la tâche
// `usage.daily` (jobs.yaml : quotidienne 02:00) une fois la journée finie, lue par pf.asso.usage (30 jours par défaut).

/** Heure locale à partir de laquelle la journée de la veille est calculée. */
export const USAGE_DAILY_HOUR = 2;
/** Rattrapage : jours passés recalculés s'ils manquent (worker arrêté, première mise en service). */
export const USAGE_CATCH_UP_DAYS = 7;
/** Période par défaut de pf.asso.usage : les 30 derniers jours finis. */
export const USAGE_DEFAULT_DAYS = 30;
/** Période la plus longue lue en une fois. */
export const USAGE_MAX_DAYS = 366;

/**
 * Jours locaux à calculer à l'instant `now` pour une association du fuseau `timeZone`, du plus ancien au plus
 * récent : les jours finis des 7 derniers absents de `computed`. La veille n'entre qu'à partir de 02:00 locale.
 */
export function usageDaysToCompute(timeZone: string, now: Date, computed: ReadonlySet<IsoDate>): IsoDate[] {
  const today = todayIn(timeZone, now);
  const latest = hourIn(timeZone, now) >= USAGE_DAILY_HOUR ? 1 : 2;
  const days: IsoDate[] = [];
  for (let back = USAGE_CATCH_UP_DAYS; back >= latest; back--) {
    const day = addDays(today, -back);
    if (!computed.has(day)) days.push(day);
  }
  return days;
}

export type UsagePeriod = { from: IsoDate; to: IsoDate } | { issue: 'from_after_to' | 'too_long' };

/**
 * Période lue par pf.asso.usage : `to` par défaut la veille de `today`, `from` par défaut 30 jours avant `to`
 * (compris). Bornes inversées ou plus de 366 jours : `issue`.
 */
export function usagePeriod(query: { from?: IsoDate; to?: IsoDate }, today: IsoDate): UsagePeriod {
  const to = query.to ?? addDays(today, -1);
  const from = query.from ?? addDays(to, -(USAGE_DEFAULT_DAYS - 1));
  parseIsoDate(from);
  parseIsoDate(to);
  if (from > to) return { issue: 'from_after_to' };
  if (addDays(from, USAGE_MAX_DAYS) <= to) return { issue: 'too_long' };
  return { from, to };
}
