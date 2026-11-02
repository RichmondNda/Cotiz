// Relecture d'un paiement : domain-rules.md § 8 (transition `validated → pending`, annulation ≤ 10 min, par l'auteur).

/** Délai pendant lequel l'auteur d'une validation peut l'annuler. */
export const REVERT_WINDOW_MS = 10 * 60_000;

export interface ReviewedPayment {
  status: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
}

/** Dernier instant (inclus) où la validation peut être annulée ; `null` si le paiement n'est pas validé. */
export function revertDeadline(payment: ReviewedPayment): Date | null {
  if (payment.status !== 'validated' || !payment.reviewedAt) return null;
  return new Date(payment.reviewedAt.getTime() + REVERT_WINDOW_MS);
}

/** Annulable maintenant par cette personne : validé, par elle, il y a 10 min au plus. */
export function canRevert(payment: ReviewedPayment, actorId: string, now: Date): boolean {
  const deadline = revertDeadline(payment);
  return deadline !== null && payment.reviewedBy === actorId && now.getTime() <= deadline.getTime();
}
