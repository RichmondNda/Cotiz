import type { PaymentMethod } from '@cotiz/contracts';
import { associationPaymentMethods } from '@cotiz/db';
import { and, asc, count, eq, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export type PaymentMethodRecord = typeof associationPaymentMethods.$inferSelect;

/**
 * Verrou de transaction des moyens de paiement d'une association : un remplacement (as.pm) et une clôture d'onboarding
 * (as.onb, qui exige un moyen actif) s'ordonnent l'un après l'autre.
 */
export async function lockPaymentMethods(associationId: string): Promise<void> {
  assertOwnAssociation(associationId, 'lockPaymentMethods');
  await currentTx().execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`payment-methods:${associationId}`}, 0))`,
  );
}

/** Nombre de moyens de paiement actifs de l'association. */
export async function activePaymentMethodsCount(associationId: string): Promise<number> {
  const [row] = await currentTx()
    .select({ n: count() })
    .from(associationPaymentMethods)
    .where(
      and(eq(associationPaymentMethods.associationId, associationId), eq(associationPaymentMethods.isActive, true)),
    );
  return row?.n ?? 0;
}

/** Moyens de paiement de l'association du contexte (RLS `tenant_isolation`), dans l'ordre d'affichage. */
export function paymentMethodsOf(associationId: string): Promise<PaymentMethodRecord[]> {
  assertOwnAssociation(associationId, 'paymentMethodsOf');
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

/** Surface publique (tenancy.public) : seulement dans le contexte de cette association. */
function assertOwnAssociation(associationId: string, name: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${name} : contexte de l’association attendu`);
  }
}
