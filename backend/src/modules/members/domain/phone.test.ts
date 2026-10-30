import { describe, expect, it } from 'vitest';
import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['+2250708091011', '+2250708091011'],
    ['+2250544218790', '+2250544218790'],
    ['+33612345678', '+33612345678'],
    ['+221770000003', '+221770000003'],
  ])('%s valide : %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['+2250000000000', '+2250100', '+999123456789', '+225070809101', '0708091011', ''])(
    '%j invalide : null',
    (input) => {
      expect(normalizePhone(input)).toBeNull();
    },
  );
});
