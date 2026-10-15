import { describe, expect, it } from 'vitest';
import { CODE_RULES, displayCode, generateCode, normalizeCode } from './one-time-code.js';

describe('codes à usage unique (architecture/03-auth.md)', () => {
  it('activation et invitations : 8 caractères sans ambiguïté, 72 h ; réinitialisation : 6 chiffres, 15 min', () => {
    for (const purpose of ['activation', 'team_invite', 'staff_invite'] as const) {
      expect(generateCode(purpose)).toMatch(/^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{8}$/);
      expect(CODE_RULES[purpose].ttlMs).toBe(72 * 3_600_000);
    }
    expect(generateCode('password_reset')).toMatch(/^\d{6}$/);
    expect(CODE_RULES.password_reset.ttlMs).toBe(15 * 60_000);
  });

  it('tirages variés (générateur cryptographique, toute la plage)', () => {
    const digits = new Set(Array.from({ length: 300 }, () => generateCode('password_reset')));
    expect(digits.size).toBeGreaterThan(290);
    expect([...digits].some((code) => code.startsWith('0'))).toBe(true);
  });

  it('affichage : K7M4-P9QX ; 6 chiffres tels quels', () => {
    expect(displayCode('activation', 'K7M4P9QX')).toBe('K7M4-P9QX');
    expect(displayCode('password_reset', '048213')).toBe('048213');
  });

  it('saisie normalisée : casse, tiret et espaces ignorés', () => {
    expect(normalizeCode('activation', ' k7m4-p9qx ')).toBe('K7M4P9QX');
    expect(normalizeCode('password_reset', '048 213')).toBe('048213');
  });
});
