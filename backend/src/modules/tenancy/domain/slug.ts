/** Identifiant d'URL d'une association (contrat : `^[a-z0-9]+(?:-[a-z0-9]+)*$`, 60 caractères au plus). */
export const SLUG_MAX = 60;

/** Slug déduit du nom : sans accents, minuscules, mots séparés par `-` ; `association` si rien ne reste. */
export function slugFromName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/, '');
  return slug === '' ? 'association' : slug;
}

/** Premier slug libre : `base`, puis `base-2`, `base-3`… (raccourci pour tenir dans la longueur maximale). */
export function firstFreeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `-${String(n)}`;
    const candidate = `${base.slice(0, SLUG_MAX - suffix.length).replace(/-+$/, '')}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}
