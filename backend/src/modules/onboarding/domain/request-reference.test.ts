import { describe, expect, it } from 'vitest';
import { requestReference } from './request-reference.js';

describe('requestReference', () => {
  it('année, puis numéro sur 5 chiffres', () => {
    expect(requestReference(2026, 42)).toBe('DEM-2026-00042');
    expect(requestReference(2027, 1n)).toBe('DEM-2027-00001');
  });

  it('au-delà de 99 999 : le numéro s’allonge, jamais tronqué', () => {
    expect(requestReference(2026, 123456)).toBe('DEM-2026-123456');
  });
});
