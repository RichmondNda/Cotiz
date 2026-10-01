/** Codes d'erreur des règles métier (docs/specs/domain-rules.md, vecteurs de test). */
export type DomainErrorCode = 'invalid_amount' | 'invalid_currency' | 'currency_mismatch';

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
