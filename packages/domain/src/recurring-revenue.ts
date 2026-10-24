import { DomainError } from './errors.js';
import { type Currency, Money } from './money.js';
import type { BillingPeriod } from './subscription.js';

const BILLING_PERIODS: readonly string[] = ['monthly', 'yearly'];

/** Abonnements au même prix et à la même période de facturation. */
export interface RecurringRevenueLine {
  price: Money;
  billingPeriod: BillingPeriod;
  /** Nombre d'abonnements (entier positif ou nul). */
  count: number;
}

/**
 * Équivalent mensuel d'un prix d'abonnement (tableau de bord plateforme, lot 1.4) : le prix mensuel tel quel, le prix
 * annuel divisé par 12 et arrondi à l'entier inférieur (jamais de revenu surestimé). Prix négatif → `invalid_amount`.
 */
export function monthlyEquivalent(price: Money, billingPeriod: BillingPeriod): Money {
  const value = Money.check(price);
  if (value.amount < 0) throw new DomainError('invalid_amount', { amount: value.amount });
  if (!BILLING_PERIODS.includes(billingPeriod)) throw new DomainError('invalid_billing_period', { billingPeriod });
  if (billingPeriod === 'monthly') return value;
  // Division entière exacte (pas de flottant) : le reste est retiré avant de diviser.
  return Money.of((value.amount - (value.amount % 12)) / 12, value.currency);
}

/**
 * Revenu mensuel récurrent : somme des équivalents mensuels, chacun arrondi avant d'être multiplié par le nombre
 * d'abonnements. Quelles lignes comptent (abonnements actifs ou impayés, sans les essais) : décidé par l'appelant.
 * Devise différente → `currency_mismatch` ; nombre invalide ou total hors des entiers sûrs → `invalid_amount`.
 */
export function monthlyRecurringRevenue(lines: readonly RecurringRevenueLine[], currency: Currency): Money {
  return Money.sum(
    lines.map(({ price, billingPeriod, count }) => {
      if (!Number.isSafeInteger(count) || count < 0) throw new DomainError('invalid_amount', { count });
      const monthly = monthlyEquivalent(price, billingPeriod);
      // Produit de deux entiers sûrs : exact tant qu'il reste sûr, sinon refusé par Money.of.
      return Money.of(monthly.amount * count, monthly.currency);
    }),
    currency,
  );
}
