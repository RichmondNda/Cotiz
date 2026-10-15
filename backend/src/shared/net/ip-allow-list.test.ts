import { describe, expect, it } from 'vitest';
import { parseIpAllowList } from './ip-allow-list.js';

describe('parseIpAllowList', () => {
  it('adresses et réseaux IPv4 / IPv6, séparés par des virgules', () => {
    const allowed = parseIpAllowList(' 203.0.113.7, 10.0.0.0/8 ,2001:db8::/32');
    expect(allowed).not.toBeNull();
    expect(allowed?.('203.0.113.7')).toBe(true);
    expect(allowed?.('203.0.113.8')).toBe(false);
    expect(allowed?.('10.42.0.1')).toBe(true);
    expect(allowed?.('11.0.0.1')).toBe(false);
    expect(allowed?.('2001:db8::1')).toBe(true);
    expect(allowed?.('2001:db9::1')).toBe(false);
  });

  it('IPv4 vue par Express en IPv6 (::ffff:a.b.c.d)', () => {
    expect(parseIpAllowList('127.0.0.1')?.('::ffff:127.0.0.1')).toBe(true);
  });

  it('adresse absente ou illisible : refusée', () => {
    const allowed = parseIpAllowList('127.0.0.1');
    expect(allowed?.(null)).toBe(false);
    expect(allowed?.('pas une ip')).toBe(false);
  });

  it.each(['', ' , ', '127.0.0.300', '10.0.0.0/33', 'exemple.org', '10.0.0.0/x'])('liste invalide : %j', (raw) => {
    expect(parseIpAllowList(raw)).toBeNull();
  });
});
