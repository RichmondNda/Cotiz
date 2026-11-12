import type { ReminderRuleInput } from '@cotiz/contracts';
import type { z } from 'zod';

/**
 * Règle de relance (lot 4.3) : contrôles qui ne dépendent que de la règle. Déclencheur `on_due` : décalage 0 ; avant ou
 * après l'échéance : 1 jour au moins. Canaux automatiques : `in_app`, `push` (SMS et email : groupe 6, absents tant
 * qu'il n'est pas activé, ui-deviations.md). Message obligatoire ; variables `{{…}}` parmi REMINDER_VARIABLES.
 */
export type RuleInput = z.infer<typeof ReminderRuleInput>;

/** Canaux qu'une règle peut utiliser sans fournisseur externe. */
export const AUTOMATIC_CHANNELS: ReadonlySet<string> = new Set(['in_app', 'push']);

/** Variables d'un message de relance, rendues pour chaque échéance (`{{prenom}}`…). */
export const REMINDER_VARIABLES = ['prenom', 'nom', 'projet', 'association', 'montant', 'echeance', 'retard'] as const;
export type ReminderVariable = (typeof REMINDER_VARIABLES)[number];

const PLACEHOLDER = /\{\{\s*([a-zA-Z]\w*)\s*\}\}/g;

/** Champs refusés et leur motif (`validation_failed`, details.fields) ; vide si la règle est valable. */
export function ruleIssues(rule: RuleInput): Record<string, string> {
  const issues: Record<string, string> = {};
  if (rule.trigger === 'on_due' && rule.offsetDays !== 0) issues.offsetDays = 'must_be_zero';
  if (rule.trigger !== 'on_due' && rule.offsetDays < 1) issues.offsetDays = 'must_be_positive';
  if (rule.channels.some((c) => !AUTOMATIC_CHANNELS.has(c))) issues.channels = 'channel_unavailable';
  else if (new Set(rule.channels).size !== rule.channels.length) issues.channels = 'duplicate';
  if (rule.message.trim() === '') issues.message = 'required';
  else if (unknownVariables(rule.message).length > 0) issues.message = 'unknown_variable';
  return issues;
}

/** Variables citées par un message et inconnues des relances. */
export function unknownVariables(message: string): string[] {
  const known = new Set<string>(REMINDER_VARIABLES);
  return [...message.matchAll(PLACEHOLDER)].map((m) => m[1] ?? '').filter((name) => !known.has(name));
}
