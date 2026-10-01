import { z } from 'zod';

/** Paramètres communs des listes : `limit` (≤ 100, 25 par défaut), `cursor`, `sort`. */
export const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().min(1).optional(),
  sort: z.string().min(1).optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;

/** Compteurs par filtre : `{ status: { late: 14 } }`. */
export const Facets = z.record(z.string(), z.record(z.string(), z.int().nonnegative()));
export type Facets = z.infer<typeof Facets>;

/** Enveloppe de liste : `{ items, nextCursor, total, facets? }`. */
export function listOf<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().nullable(),
    total: z.int().nonnegative(),
    facets: Facets.optional(),
  });
}
