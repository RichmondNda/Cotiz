/** Codes d'erreur des règles métier (docs/specs/domain-rules.md, vecteurs de test). */
export type DomainErrorCode =
  | 'invalid_amount'
  | 'invalid_currency'
  | 'currency_mismatch'
  // Échéancier (domain-rules § 2).
  | 'invalid_frequency'
  | 'invalid_due_day'
  | 'end_date_required'
  | 'end_before_start'
  // Contrôles d'entrée non décrits par domain-rules : date illisible, type de calendrier ou horizon inconnus.
  | 'invalid_date'
  | 'invalid_schedule_type'
  | 'invalid_horizon'
  // Répartition (domain-rules § 4) ; les erreurs de validateAllocation sont renvoyées, pas levées.
  | 'amount_exceeds_remaining'
  // Statuts : délai de grâce ou statut d'inscription invalides (non décrits par domain-rules).
  | 'invalid_grace_days'
  | 'invalid_status';

/** Erreur d'une règle métier : `code` stable, `details` facultatifs (ex. `maxAmount`). */
export class DomainError extends Error {
  override readonly name = 'DomainError';
  constructor(
    readonly code: DomainErrorCode,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(code);
  }
}
