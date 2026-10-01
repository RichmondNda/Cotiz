import { z } from 'zod';
import { PaymentMethodKind } from './enums.js';
import { Uuid } from './scalars.js';

/**
 * Moyen de paiement accepté par l'association (onboarding étape 3, paramètres, étape 4 d'un projet).
 * `details` dépend du moyen : `{ bank, iban }`, `{ operator, number }`…
 */
export const PaymentMethod = z.object({
  id: Uuid,
  kind: PaymentMethodKind,
  label: z.string().min(1).max(80),
  details: z.record(z.string(), z.string()),
  instructions: z.string().nullable(),
  position: z.int().nonnegative(),
  isActive: z.boolean(),
});
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Saisie d'un moyen de paiement ; l'ordre de la liste donne `position`. */
export const PaymentMethodInput = PaymentMethod.omit({ id: true, position: true }).extend({
  /** Absent : nouveau moyen. */
  id: Uuid.optional(),
  instructions: z.string().max(500).nullable().optional(),
  isActive: z.boolean().default(true),
});
