/** Erreur PostgreSQL d'origine (Drizzle l'enveloppe dans `cause`) : SQLSTATE et contrainte en cause. */
export function pgErrorOf(error: unknown): (Error & { code: string; constraint?: unknown }) | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string') return e as Error & { code: string; constraint?: unknown };
  }
  return undefined;
}

/** Violation d'unicité (23505) de la contrainte nommée, et d'aucune autre. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pg = pgErrorOf(error);
  return pg?.code === '23505' && pg.constraint === constraint;
}
