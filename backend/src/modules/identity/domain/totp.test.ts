import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  generateTotpSecret,
  hotp,
  matchTotp,
  normalizeRecoveryCode,
  otpauthUrl,
  RECOVERY_CODES_COUNT,
  totpStep,
} from './totp.js';

// Secret des annexes des RFC 4226 et 6238 (SHA-1) : « 12345678901234567890 ».
const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP (RFC 6238)', () => {
  it('HOTP : vecteurs de l’annexe D de la RFC 4226', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expect(expected.map((_, counter) => hotp(RFC_SECRET, counter))).toEqual(expected);
  });

  it('TOTP : vecteurs SHA-1 de l’annexe B de la RFC 6238 (6 derniers chiffres)', () => {
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [seconds, code] of vectors) {
      expect(hotp(RFC_SECRET, totpStep(new Date(seconds * 1000)))).toBe(code);
    }
  });

  it('base 32 : RFC 4648 sans remplissage, aller-retour', () => {
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
    expect(base32Decode('mzxw 6ytb oi==').toString()).toBe('foobar');
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Encode(base32Decode(secret))).toBe(secret);
    expect(() => base32Decode('ABC1')).toThrow();
  });

  it('matchTotp : pas courant et ±1 acceptés, au-delà refusé ; code mal formé refusé', () => {
    const secret = base32Encode(RFC_SECRET);
    const now = new Date(1111111111 * 1000);
    const step = totpStep(now);
    expect(matchTotp(secret, hotp(RFC_SECRET, step), now)).toBe(step);
    expect(matchTotp(secret, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
    expect(matchTotp(secret, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    expect(matchTotp(secret, hotp(RFC_SECRET, step - 2), now)).toBeNull();
    expect(matchTotp(secret, hotp(RFC_SECRET, step + 2), now)).toBeNull();
    expect(matchTotp(secret, '12345', now)).toBeNull();
    expect(matchTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('otpauthUrl : émetteur, compte et paramètres', () => {
    const raw = otpauthUrl({ issuer: 'Cotiz', account: 'awa@cotiz.app', secret: 'MZXW6YTBOI' });
    expect(raw.startsWith('otpauth://totp/Cotiz:awa%40cotiz.app?')).toBe(true);
    const url = new URL(raw);
    expect(url.searchParams.get('secret')).toBe('MZXW6YTBOI');
    expect(url.searchParams.get('issuer')).toBe('Cotiz');
    expect(url.searchParams.get('digits')).toBe('6');
    expect(url.searchParams.get('period')).toBe('30');
  });

  it('codes de secours : 10, distincts, forme ABCDE-FGHJK, normalisés sans tiret', () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(RECOVERY_CODES_COUNT);
    expect(new Set(codes).size).toBe(RECOVERY_CODES_COUNT);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJ-KM-NP-Z]{5}-[2-9A-HJ-KM-NP-Z]{5}$/);
    expect(normalizeRecoveryCode(' abcde-fghjk ')).toBe('ABCDEFGHJK');
  });
});
