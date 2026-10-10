import { ActivationCode } from '@cotiz/contracts';
import { describe, expect, it } from 'vitest';
import {
  ACTIVATION_CODE_ALPHABET,
  formatActivationCode,
  generateActivationCode,
  normalizeActivationCode,
} from './activation-code.js';

describe('codes d’activation (architecture/03-auth.md)', () => {
  it('alphabet sans caractère ambigu (0, O, 1, I, L)', () => {
    expect(ACTIVATION_CODE_ALPHABET).toBe('23456789ABCDEFGHJKMNPQRSTUVWXYZ');
    for (const c of '01OIL') expect(ACTIVATION_CODE_ALPHABET).not.toContain(c);
  });

  it('8 caractères de l’alphabet, accepté par le contrat une fois formaté', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateActivationCode();
      expect(code).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
      expect(ActivationCode.safeParse(formatActivationCode(code)).success).toBe(true);
    }
  });

  it('tiré au hasard : tous les caractères apparaissent, deux codes diffèrent', () => {
    const seen = new Set<string>();
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = generateActivationCode();
      codes.add(code);
      for (const c of code) seen.add(c);
    }
    expect(seen.size).toBe(ACTIVATION_CODE_ALPHABET.length);
    expect(codes.size).toBe(500);
  });

  it('affiché K7M4-P9QX, saisi en minuscules ou sans tiret', () => {
    expect(formatActivationCode('K7M4P9QX')).toBe('K7M4-P9QX');
    expect(normalizeActivationCode('k7m4-p9qx')).toBe('K7M4P9QX');
    expect(normalizeActivationCode(' K7M4P9QX ')).toBe('K7M4P9QX');
  });
});
