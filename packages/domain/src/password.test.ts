import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { COMMON_PASSWORDS, isStrongPassword, MIN_PASSWORD_LENGTH } from './password.js';

describe('isStrongPassword (errors.yaml : weak_password)', () => {
  it('10 caractères minimum', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(10);
    expect(isStrongPassword('Baobab-26')).toBe(false);
    expect(isStrongPassword('Baobab-Lagune')).toBe(true);
  });

  it('refuse les mots de passe courants, sans tenir compte de la casse ni des espaces autour', () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(100);
    for (const common of ['1234567890', 'azertyuiop', 'motdepasse123', 'Password123', ' QWERTYUIOP ']) {
      expect(isStrongPassword(common)).toBe(false);
    }
  });

  it('refuse un seul caractère répété ou une suite de chiffres', () => {
    expect(isStrongPassword('aaaaaaaaaaaa')).toBe(false);
    expect(isStrongPassword('0000000000')).toBe(false);
    expect(isStrongPassword('2250544218790')).toBe(false);
  });

  it('refuse un mot de passe qui contient l’identifiant de la personne', () => {
    expect(isStrongPassword('richy@cotiz.app!', { identifier: 'richy@cotiz.app' })).toBe(false);
    expect(isStrongPassword('Moussa+2250544218790', { identifier: '+2250544218790' })).toBe(false);
    expect(isStrongPassword('Lagune-Baobab-2026', { identifier: '+2250544218790' })).toBe(true);
  });

  it('les mots de passe de la liste ont tous au moins 10 caractères (sinon la longueur suffit)', () => {
    expect([...COMMON_PASSWORDS].filter((p) => p.length < MIN_PASSWORD_LENGTH)).toEqual([]);
  });

  it('propriété : tout mot de passe de moins de 10 caractères est refusé', () => {
    fc.assert(fc.property(fc.string({ maxLength: 9 }), (password) => !isStrongPassword(password)));
  });

  it('espaces seuls ou autour d’un mot de passe courant : refusés (longueur comptée après nettoyage)', () => {
    expect(isStrongPassword(' '.repeat(10))).toBe(false);
    expect(isStrongPassword('  motdepasse  ')).toBe(false);
    expect(isStrongPassword('   Baobab   ')).toBe(false);
  });

  it('variantes d’un mot courant (chiffres ou ponctuation autour) : refusées', () => {
    for (const variant of ['azertyuiop!', 'Motdepasse2027', '2026Password!', 'bienvenue@2026', 'Cotisation#1']) {
      expect(isStrongPassword(variant)).toBe(false);
    }
  });

  it('partie locale de l’email et fin du téléphone (format local) : refusées', () => {
    expect(isStrongPassword('richy.nda-Lagune', { identifier: 'richy.nda@cotiz.app' })).toBe(false);
    expect(isStrongPassword('Lagune0544218790', { identifier: '+2250544218790' })).toBe(false);
    expect(isStrongPassword('Lagune-Baobab-2026', { identifier: 'richy.nda@cotiz.app' })).toBe(true);
  });
});
