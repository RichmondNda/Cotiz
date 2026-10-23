import { describe, expect, it } from 'vitest';
import { firstFreeSlug, SLUG_MAX, slugFromName } from './slug.js';

describe('slugFromName', () => {
  it.each([
    ['Entraide Yopougon', 'entraide-yopougon'],
    ['Jeunesse solidaire de Bouaké', 'jeunesse-solidaire-de-bouake'],
    ['  Mutuelle « Les Élus » — 2026 !  ', 'mutuelle-les-elus-2026'],
    ['Association d’Œuvres', 'association-d-uvres'],
    ['¡¿!', 'association'],
  ])('%s → %s', (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
  });

  it('60 caractères au plus, sans tiret final', () => {
    const slug = slugFromName(`${'a'.repeat(59)} bcd`);
    expect(slug).toBe('a'.repeat(59));
    expect(slugFromName('x'.repeat(80))).toHaveLength(SLUG_MAX);
  });
});

describe('firstFreeSlug', () => {
  it('le slug lui-même s’il est libre, sinon le premier suffixe libre', () => {
    expect(firstFreeSlug('entraide', new Set())).toBe('entraide');
    expect(firstFreeSlug('entraide', new Set(['entraide']))).toBe('entraide-2');
    expect(firstFreeSlug('entraide', new Set(['entraide', 'entraide-2', 'entraide-3']))).toBe('entraide-4');
  });

  it('raccourcit la base pour garder la longueur maximale', () => {
    const base = 'b'.repeat(SLUG_MAX);
    const slug = firstFreeSlug(base, new Set([base]));
    expect(slug).toBe(`${'b'.repeat(SLUG_MAX - 2)}-2`);
    expect(slug).toHaveLength(SLUG_MAX);
  });
});
