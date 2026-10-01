import { z } from 'zod';

// Types de base des échanges (architecture/06-api-conventions.md).

/** Devises gérées par `formatMoney` (docs/specs/domain-rules.md § 1). */
export const Currency = z.enum(['XOF', 'XAF', 'GNF']);
export type Currency = z.infer<typeof Currency>;

/** Montant : entier sûr dans la plus petite unité de la devise (25 000 F = 25000), jamais de décimal. */
export const Money = z
  .object({
    amount: z.int(),
    currency: Currency,
  })
  .meta({ id: 'Money' });
export type Money = z.infer<typeof Money>;

/** Date civile, ex. échéance : `2026-10-05`. */
export const IsoDate = z.iso.date();
export type IsoDate = z.infer<typeof IsoDate>;

/** Instant UTC : `2026-09-12T14:03:22Z`. */
export const Instant = z.iso.datetime();
export type Instant = z.infer<typeof Instant>;

/** Identifiant (UUID v7 généré par le back). */
export const Uuid = z.uuid();
export type Uuid = z.infer<typeof Uuid>;
