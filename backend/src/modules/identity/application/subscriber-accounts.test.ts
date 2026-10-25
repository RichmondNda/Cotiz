import { describe, expect, it } from 'vitest';
import { initialOf } from './subscriber-accounts.js';

describe('initialOf : initiale du nom renvoyée par mb.lookup (un caractère UTF-16, contrat length(1))', () => {
  it.each([
    ['Traoré', 'Fatou', 'T'],
    ['  élise', 'Awa', 'É'],
    ['', 'Moussa', 'M'],
    ['   ', 'awa', 'A'],
    ['𝔇iarra', 'Moussa', 'M'],
    ['𝔇', '𝔐', '?'],
    ['', '', '?'],
  ])('nom %j, prénom %j : %j', (lastName, firstName, expected) => {
    expect(initialOf(lastName, firstName)).toBe(expected);
  });
});
