import { z } from 'zod';
import { PaymentMethodKind } from './enums.js';
import { PhoneE164 } from './people.js';
import { Uuid } from './scalars.js';

/**
 * Moyen de paiement accepté par l'association (onboarding étape 3, paramètres, étape 4 d'un projet).
 * `details` dépend du moyen : `{ bank, iban }`, `{ operator, number }`…
 */
export const PaymentMethod = z
  .object({
    id: Uuid,
    kind: PaymentMethodKind,
    label: z.string().min(1).max(80),
    details: z.record(z.string(), z.string()),
    instructions: z.string().nullable(),
    position: z.int().nonnegative(),
    isActive: z.boolean(),
  })
  .meta({ id: 'PaymentMethod' });
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Opérateurs mobile money acceptés (`details.operator`). */
export const MOBILE_MONEY_OPERATORS = ['orange', 'mtn', 'moov', 'wave'] as const;
export const MobileMoneyOperator = z.enum(MOBILE_MONEY_OPERATORS);

/** IBAN : 2 lettres de pays, 2 chiffres de contrôle, 10 à 30 caractères ; espaces et minuscules tolérés à la saisie. */
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;
const Iban = z
  .string()
  .max(50)
  .refine((v) => IBAN.test(v.replace(/\s+/g, '').toUpperCase()), 'iban');

/** `details` attendu pour chaque moyen ; toute autre clé est refusée. */
export const PAYMENT_METHOD_DETAILS = {
  bank_transfer: z.strictObject({ iban: Iban, bank: z.string().min(1).max(80).optional() }),
  mobile_money: z.strictObject({ operator: MobileMoneyOperator, number: PhoneE164 }),
  cash: z.strictObject({}),
  other: z.strictObject({}),
} as const satisfies Record<z.infer<typeof PaymentMethodKind>, z.ZodType>;

/** Moyens sans détail : la façon de payer est décrite par les instructions, obligatoires. */
const NEEDS_INSTRUCTIONS: ReadonlySet<string> = new Set(['cash', 'other']);

/**
 * Saisie d'un moyen de paiement ; l'ordre de la liste donne `position`. `details` validé selon `kind`
 * (`PAYMENT_METHOD_DETAILS`) ; espèces et autre : instructions obligatoires.
 */
export const PaymentMethodInput = PaymentMethod.omit({ id: true, position: true })
  .extend({
    /** Absent : nouveau moyen. */
    id: Uuid.optional(),
    instructions: z.string().max(500).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((method, ctx) => {
    const details = PAYMENT_METHOD_DETAILS[method.kind].safeParse(method.details);
    if (!details.success) {
      for (const issue of details.error.issues) {
        ctx.addIssue({ code: 'custom', message: issue.message, path: ['details', ...issue.path] });
      }
    }
    if (NEEDS_INSTRUCTIONS.has(method.kind) && !method.instructions?.trim()) {
      ctx.addIssue({ code: 'custom', message: 'instructions_required', path: ['instructions'] });
    }
  });
