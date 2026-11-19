import { addDays, type IsoDate, parseIsoDate } from './dates.js';
import { DomainError } from './errors.js';
import { type BillingPeriod, periodEnd } from './subscription.js';

// Factures d'abonnement de la plateforme (lot 4.6, règles retenues avec l'utilisateur le 2026-11-13,
// .claude/notes/decisions.md) : une facture par période payante, émise le premier jour de la période, à échéance
// 15 jours après son émission ; aucune pendant l'essai ni pour un plan à 0 F ; montant = prix actuel du plan pour la
// période. Mise en service (2026-11-15) : un abonnement encore jamais facturé ne l'est qu'à partir de la période du jour,
// jamais pour les périodes antérieures.

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'suspended' | 'canceled';
export type InvoiceStatus = 'draft' | 'open' | 'paid' | 'overdue' | 'void';

/** Jours entre l'émission de la facture (en principe le premier jour de sa période) et son échéance. */
export const INVOICE_DUE_DAYS = 15;

/**
 * Numéro de facture `CTZ-<année>-<numéro sur 6 chiffres>` ; `sequence` vient d'une séquence globale jamais remise à
 * zéro (`invoice_number_seq`) : deux séquences différentes ne donnent jamais le même numéro, au-delà de 999 999 le
 * numéro s'allonge.
 */
export function invoiceNumber(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1900 || year > 2199) throw new DomainError('invalid_date', { year });
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new DomainError('invalid_sequence', { sequence });
  return `CTZ-${String(year)}-${String(sequence).padStart(6, '0')}`;
}

/**
 * Échéance (dernier jour pour payer) : 15 jours après l'émission, comptés du premier jour de la période si la facture
 * est émise ce jour-là (ou avant), sinon du jour d'émission (rattrapage) : une facture n'est jamais échue à l'émission.
 */
export function invoiceDueOn(periodStart: IsoDate, issuedOn: IsoDate = periodStart): IsoDate {
  parseIsoDate(periodStart);
  parseIsoDate(issuedOn);
  return addDays(issuedOn > periodStart ? issuedOn : periodStart, INVOICE_DUE_DAYS);
}

/** Une facture ouverte devient impayée le lendemain de son échéance (`today` : date locale de l'association). */
export function isInvoiceOverdue(invoice: { status: InvoiceStatus; dueOn: IsoDate }, today: IsoDate): boolean {
  parseIsoDate(today);
  return invoice.status === 'open' && today > invoice.dueOn;
}

export interface BillingRunInput {
  status: SubscriptionStatus;
  billingPeriod: BillingPeriod;
  currentPeriodStart: IsoDate;
  currentPeriodEnd: IsoDate | null;
  /** Prix actuel du plan pour la période, en entier de la devise. */
  price: number;
  /**
   * Premiers jours des périodes déjà facturées de cet abonnement (factures annulées comprises). Vide : abonnement
   * jamais facturé (mise en service) → seule la période du jour est facturée.
   */
  invoicedPeriodStarts: readonly IsoDate[];
  /** Date locale de l'association. */
  today: IsoDate;
}

export interface InvoiceToIssue {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  amount: number;
  dueOn: IsoDate;
}

export interface BillingRun {
  /** Nouvelle période en cours (et statut), `null` si elle ne change pas. */
  period: { status: SubscriptionStatus; currentPeriodStart: IsoDate; currentPeriodEnd: IsoDate } | null;
  /** Factures à émettre, dans l'ordre des périodes. */
  invoices: InvoiceToIssue[];
}

const BILLED: readonly SubscriptionStatus[] = ['trialing', 'active', 'past_due'];

/**
 * Passage quotidien d'un abonnement (tâche billing.issue-invoices) : facture la période en cours si elle ne l'est pas,
 * puis avance de période en période jusqu'à celle qui contient `today` (la suivante commence le lendemain de la
 * précédente, domain-rules § 10), en facturant chacune ; abonnement jamais facturé : seule la période qui contient
 * `today` l'est (aucune facture rétroactive à la mise en service). Un essai terminé passe `active` ; `past_due` le reste (seul le
 * paiement des factures impayées le lève). Suspendu ou résilié : rien. Rejouable : une période déjà facturée ne l'est
 * jamais deux fois.
 */
export function billingRun(input: BillingRunInput): BillingRun {
  if (!BILLED.includes(input.status)) return { period: null, invoices: [] };
  if (!Number.isSafeInteger(input.price) || input.price < 0) {
    throw new DomainError('invalid_amount', { price: input.price });
  }
  if (input.currentPeriodEnd === null) throw new DomainError('invalid_date', { currentPeriodEnd: null });
  parseIsoDate(input.today);
  parseIsoDate(input.currentPeriodStart);

  const invoiced = new Set(input.invoicedPeriodStarts);
  const neverBilled = invoiced.size === 0;
  const invoices: InvoiceToIssue[] = [];
  let status = input.status;
  let start = input.currentPeriodStart;
  let end = input.currentPeriodEnd;
  let changed = false;

  const bill = () => {
    if (status === 'trialing' || input.price === 0 || invoiced.has(start)) return;
    // Mise en service : une période déjà finie n'est pas facturée.
    if (neverBilled && input.today > end) return;
    invoiced.add(start);
    invoices.push({
      periodStart: start,
      periodEnd: end,
      amount: input.price,
      dueOn: invoiceDueOn(start, input.today),
    });
  };

  bill();
  while (input.today > end) {
    start = addDays(end, 1);
    end = periodEnd(start, input.billingPeriod);
    if (status === 'trialing') status = 'active';
    changed = true;
    bill();
  }
  return {
    period: changed ? { status, currentPeriodStart: start, currentPeriodEnd: end } : null,
    invoices,
  };
}

/**
 * Statut d'un abonnement selon ses factures impayées : au moins une → `past_due` ; plus aucune → `past_due` redevient
 * `active`. Essai, suspension et résiliation ne changent pas.
 */
export function subscriptionStatusAfterInvoices(
  status: SubscriptionStatus,
  invoices: { overdueCount: number },
): SubscriptionStatus {
  if (status === 'active' && invoices.overdueCount > 0) return 'past_due';
  if (status === 'past_due' && invoices.overdueCount === 0) return 'active';
  return status;
}
