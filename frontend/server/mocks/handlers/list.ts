// Pagination des listes simulées : enveloppe `{ items, nextCursor, total, facets? }` du contrat (curseur = position).

export interface PageQuery { limit?: number, cursor?: string }

export function page<T>(all: T[], query: PageQuery | undefined, extra: { total?: number, facets?: Record<string, Record<string, number>> } = {}) {
  const limit = query?.limit ?? 25
  const start = query?.cursor ? Number(query.cursor) || 0 : 0
  const items = all.slice(start, start + limit)
  const next = start + limit < all.length ? String(start + limit) : null
  return {
    items,
    nextCursor: next,
    // Total : lignes listées, ou compteur de référence quand des lignes ne sont pas détaillées (complément non nommé).
    total: Math.max(extra.total ?? 0, all.length),
    ...(extra.facets ? { facets: extra.facets } : {}),
  }
}

/** Compteurs par valeur d'un champ : `{ status: { late: 14 } }`. */
export function facetOf<T>(rows: T[], key: string, value: (row: T) => string, extra: Record<string, number> = {}) {
  const counts: Record<string, number> = { ...extra }
  for (const r of rows) {
    const v = value(r)
    counts[v] = (counts[v] ?? 0) + 1
  }
  return { [key]: counts }
}
