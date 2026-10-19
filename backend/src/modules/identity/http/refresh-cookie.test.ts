import { describe, expect, it } from 'vitest';
import { readRefreshCookie } from './refresh-cookie.js';

describe('readRefreshCookie', () => {
  it('lit le jeton parmi les autres cookies', () => {
    expect(readRefreshCookie('theme=sombre; cotiz_refresh=abc-DEF_123; autre=1')).toBe('abc-DEF_123');
    expect(readRefreshCookie('cotiz_refresh=abc')).toBe('abc');
  });

  it('absent, vide, homonyme partiel ou encodage invalide : undefined', () => {
    expect(readRefreshCookie(undefined)).toBeUndefined();
    expect(readRefreshCookie('')).toBeUndefined();
    expect(readRefreshCookie('cotiz_refresh=')).toBeUndefined();
    expect(readRefreshCookie('x_cotiz_refresh=abc; cotiz_refresh_old=def')).toBeUndefined();
    expect(readRefreshCookie('cotiz_refresh=%E0%A4%A')).toBeUndefined();
  });
});
