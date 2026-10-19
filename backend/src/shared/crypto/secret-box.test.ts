import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SecretBox } from './secret-box.js';

const key = randomBytes(32);

describe('SecretBox (AES-256-GCM)', () => {
  it('chiffre et déchiffre, lié à son contexte (AAD)', () => {
    const box = new SecretBox(key);
    const sealed = box.seal('K7M4P9QX', 'one_time_codes:1');
    expect(sealed.toString('latin1')).not.toContain('K7M4P9QX');
    expect(box.open(sealed, 'one_time_codes:1')).toBe('K7M4P9QX');
  });

  it('jamais deux fois le même chiffré (IV aléatoire)', () => {
    const box = new SecretBox(key);
    expect(box.seal('K7M4P9QX', 'a').equals(box.seal('K7M4P9QX', 'a'))).toBe(false);
  });

  it('refuse un chiffré altéré, un autre contexte ou une autre clé', () => {
    const box = new SecretBox(key);
    const sealed = box.seal('K7M4P9QX', 'one_time_codes:1');
    const tampered = Buffer.from(sealed);
    tampered[tampered.length - 1] = (tampered[tampered.length - 1] ?? 0) ^ 1;
    expect(() => box.open(tampered, 'one_time_codes:1')).toThrow();
    expect(() => box.open(sealed, 'one_time_codes:2')).toThrow();
    expect(() => new SecretBox(randomBytes(32)).open(sealed, 'one_time_codes:1')).toThrow();
    expect(() => box.open(Buffer.from([1, 2, 3]), 'one_time_codes:1')).toThrow();
  });

  it('clé de 32 octets exigée', () => {
    expect(() => new SecretBox(randomBytes(16))).toThrow(/32 octets/);
  });
});
