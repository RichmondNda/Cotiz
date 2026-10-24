import type { FinancialTerms, SchedulePreview } from '@cotiz/contracts';
import {
  type Currency,
  DomainError,
  generateSchedule,
  Money,
  type ScheduleInput,
  type ScheduleLine,
} from '@cotiz/domain';
import type { z } from 'zod';

type Terms = z.infer<typeof FinancialTerms>;

/** Champ fautif de chaque erreur de generateSchedule() (domain-rules § 2), pour la réponse 422 `fields`. */
const FIELD_OF: Readonly<Record<string, string>> = {
  invalid_frequency: 'frequency',
  invalid_due_day: 'dueDay',
  invalid_schedule_type: 'scheduleType',
  end_date_required: 'endDate',
  end_before_start: 'endDate',
  invalid_horizon: 'horizon',
};

/** Champs du contrat de generateSchedule() traduits vers ceux du corps (`entryFeeAmount` → `entryFee`). */
const INPUT_FIELD: Readonly<Record<string, string>> = { entryFeeAmount: 'entryFee' };

/** Erreurs par champ, comme `validation_failed.fields`. */
export type FieldProblems = Record<string, string>;

/**
 * Montants dans la devise de l'association (pas de conversion) : un montant dans une autre devise est refusé sur son
 * champ (`currency_mismatch`). `{}` si tout est dans la devise.
 */
export function currencyProblems(
  terms: Pick<Terms, 'installmentAmount' | 'entryFee'>,
  currency: string,
): FieldProblems {
  const problems: FieldProblems = {};
  if (terms.installmentAmount.currency !== currency) problems.installmentAmount = 'currency_mismatch';
  if (terms.entryFee && terms.entryFee.currency !== currency) problems.entryFee = 'currency_mismatch';
  return problems;
}

/** Entrée de generateSchedule() pour des conditions du contrat ; fonds d'entrée à 0 = aucun (domain-rules § 2). */
export function scheduleInputOf(
  terms: Terms,
  extra: { enrolledFrom?: string | undefined; horizon?: number | undefined } = {},
): ScheduleInput {
  return {
    installmentAmount: terms.installmentAmount.amount,
    entryFeeAmount: terms.entryFee?.amount ?? null,
    frequency: terms.frequency,
    dueDay: terms.dueDay,
    scheduleType: terms.scheduleType,
    startDate: terms.startDate,
    endDate: terms.endDate,
    enrolledFrom: extra.enrolledFrom ?? null,
    horizon: extra.horizon ?? null,
  };
}

/** Champ fautif d'une erreur du domaine ; date illisible : le champ qui porte la valeur refusée. */
function fieldOf(error: DomainError, input: ScheduleInput): string {
  const known = FIELD_OF[error.code];
  if (known) return known;
  if (error.code === 'invalid_amount' && typeof error.details.field === 'string') {
    return INPUT_FIELD[error.details.field] ?? error.details.field;
  }
  if (error.code === 'invalid_date') {
    const dated = (['startDate', 'endDate', 'enrolledFrom'] as const).find((f) => input[f] === error.details.value);
    if (dated) return dated;
  }
  return '_';
}

/**
 * Échéancier de `input` par generateSchedule(), ou les erreurs par champ (une à la fois, dans l'ordre du domaine).
 * Seule source des dates et des montants : la même fonction que l'aperçu du front.
 */
export function scheduleOf(input: ScheduleInput): ScheduleLine[] | FieldProblems {
  try {
    return generateSchedule(input);
  } catch (error) {
    if (error instanceof DomainError) return { [fieldOf(error, input)]: error.code };
    throw error;
  }
}

/**
 * Aperçu d'un échéancier (pr.preview, indicateurs d'un projet) : lignes en `currency`, nombre d'échéances (hors fonds
 * d'entrée) ; total par souscripteur pour des dates fixes, somme contrôlée des lignes (au-delà des entiers sûrs ou
 * échéancier vide : `null`, comme le front).
 */
export function previewOf(
  lines: readonly ScheduleLine[],
  scheduleType: Terms['scheduleType'],
  currency: Currency,
): z.infer<typeof SchedulePreview> {
  const installments = lines.map((l) => ({ ...l, amountDue: Money.of(l.amountDue, currency) }));
  let totalPerSubscriber: Money | null = null;
  if (scheduleType === 'fixed' && installments.length > 0) {
    try {
      totalPerSubscriber = Money.sum(
        installments.map((l) => l.amountDue),
        currency,
      );
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
    }
  }
  return {
    installments,
    periodicCount: lines.filter((l) => l.kind === 'periodic').length,
    totalPerSubscriber,
  };
}

/**
 * Conditions d'un projet (pr.create) : montants dans la devise de l'association, échéancier du projet par
 * generateSchedule() ; dates fixes : au moins une échéance (`endDate: no_installment`, sinon le fonds d'entrée n'aurait
 * pas de date) et un total par souscripteur représentable (`installmentAmount: total_too_large`). Échéancier du projet,
 * ou les erreurs par champ.
 */
export function projectScheduleOf(terms: Terms, currency: Currency): ScheduleLine[] | FieldProblems {
  const problems = currencyProblems(terms, currency);
  if (Object.keys(problems).length > 0) return problems;
  const lines = scheduleOf(scheduleInputOf(terms));
  if (!Array.isArray(lines)) return lines;
  if (terms.scheduleType === 'fixed') {
    if (lines.length === 0) return { endDate: 'no_installment' };
    if (previewOf(lines, 'fixed', currency).totalPerSubscriber === null) {
      return { installmentAmount: 'total_too_large' };
    }
  }
  return lines;
}
