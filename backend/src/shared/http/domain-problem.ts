import type { ErrorCode } from '@cotiz/contracts';

/** Détails publics d'une erreur : jamais de donnée personnelle ni de secret. */
export interface ProblemDetails {
  detail?: string;
  /** `validation_failed` : chemin du champ → code de la règle. */
  fields?: Record<string, string>;
  /** `quota_exceeded` : limite de la formule et usage actuel. */
  limit?: number;
  usage?: number;
  /** `amount_exceeds_remaining` : montant maximal accepté (entier de la devise). */
  maxAmount?: number;
  /** `allocation_exceeds_remaining` : échéance en cause et son reste dû. */
  installmentId?: string;
  remaining?: number;
  /** `allocation_mismatch` : montant à répartir et montant réparti. */
  expected?: number;
  allocated?: number;
  /** `payment_already_reviewed` : nom du gestionnaire qui a traité (errors.yaml) et statut du paiement. */
  reviewerName?: string | null;
  paymentStatus?: string;
}

/**
 * Erreur métier attendue, rendue en `application/problem+json` avec son `code` (docs/specs/errors.yaml) et le statut
 * HTTP du catalogue. Toute autre erreur reste une erreur serveur.
 */
export class DomainProblem extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: ProblemDetails = {},
  ) {
    super(code);
    this.name = 'DomainProblem';
  }
}
