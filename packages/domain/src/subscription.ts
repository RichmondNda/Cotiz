import { addDays, addMonths, daysInMonth, formatIsoDate, type IsoDate, parseIsoDate } from './dates.js';
import { DomainError } from './errors.js';

export type BillingPeriod = 'monthly' | 'yearly';

export interface FirstPeriodInput {
  startsOn: IsoDate;
  billingPeriod: BillingPeriod;
  /** Jours d'essai (1 à 365) ; `null` : abonnement actif dès le début. */
  trialDays: number | null;
}

export interface FirstPeriod {
  status: 'active' | 'trialing';
  /** Dernier jour inclus de la période en cours. */
  currentPeriodEnd: IsoDate;
  trialEndsAt: IsoDate | null;
}

const MAX_TRIAL_DAYS = 365;
const BILLING_PERIODS: readonly string[] = ['monthly', 'yearly'];

/**
 * Dernier jour (inclus) d'une période payante qui commence le `start` (domain-rules § 10) : un mois ou un an plus
 * tard, jour ramené à la fin d'un mois plus court, moins un jour (1er nov. → 30 nov. ; 31 janv. → 27 févr.).
 */
export function periodEnd(start: IsoDate, billingPeriod: BillingPeriod): IsoDate {
  if (!BILLING_PERIODS.includes(billingPeriod)) {
    throw new DomainError('invalid_billing_period', { billingPeriod });
  }
  const { year, month, day } = parseIsoDate(start);
  const next = addMonths(year, month, billingPeriod === 'monthly' ? 1 : 12);
  return addDays(formatIsoDate({ ...next, day: Math.min(day, daysInMonth(next.year, next.month)) }), -1);
}

/**
 * Première période d'un abonnement (approbation, création directe ; domain-rules § 10). Sans essai : `active`,
 * période payante complète. Avec essai : `trialing`, la période en cours est l'essai (`days` jours, le jour de début
 * compris) ; la première période payante commence le lendemain de `trialEndsAt`.
 */
export function firstSubscriptionPeriod(input: FirstPeriodInput): FirstPeriod {
  if (input.trialDays === null) {
    return { status: 'active', currentPeriodEnd: periodEnd(input.startsOn, input.billingPeriod), trialEndsAt: null };
  }
  if (!Number.isInteger(input.trialDays) || input.trialDays < 1 || input.trialDays > MAX_TRIAL_DAYS) {
    throw new DomainError('invalid_trial_days', { trialDays: input.trialDays });
  }
  // Période de facturation contrôlée aussi pendant l'essai : elle servira à la première période payante.
  periodEnd(input.startsOn, input.billingPeriod);
  const trialEndsAt = addDays(input.startsOn, input.trialDays - 1);
  return { status: 'trialing', currentPeriodEnd: trialEndsAt, trialEndsAt };
}
