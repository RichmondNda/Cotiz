import type { PaymentMethod } from '@cotiz/contracts';
import { associationPaymentMethods } from '@cotiz/db';
import { asc, eq } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type PaymentMethodRecord = typeof associationPaymentMethods.$inferSelect;

/** Moyens de paiement de l'association (RLS `tenant_isolation`), dans l'ordre d'affichage. */
export function paymentMethodsOf(associationId: string): Promise<PaymentMethodRecord[]> {
  return currentTx()
    .select()
    .from(associationPaymentMethods)
    .where(eq(associationPaymentMethods.associationId, associationId))
    .orderBy(asc(associationPaymentMethods.position), asc(associationPaymentMethods.id));
}

/** Moyen de paiement du contrat ; `details` a été validé par type à l'écriture (PaymentMethodInput). */
export function toPaymentMethod(row: PaymentMethodRecord): PaymentMethod {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    details: row.details as Record<string, string>,
    instructions: row.instructions,
    position: row.position,
    isActive: row.isActive,
  };
}

/**
 * Moyen tel qu'écrit au journal d'audit : le numéro mobile money passe sous la clé `phone`, masquée par l'audit
 * (règle 10) ; la position est portée par l'ordre de la liste.
 */
export function toAuditedPaymentMethod(method: PaymentMethod): Record<string, unknown> {
  const { number, ...details } = method.details;
  return {
    id: method.id,
    kind: method.kind,
    label: method.label,
    details: number === undefined ? details : { ...details, phone: number },
    instructions: method.instructions,
    isActive: method.isActive,
  };
}
