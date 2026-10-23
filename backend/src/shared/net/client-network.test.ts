import { describe, expect, it } from 'vitest';
import { clientNetwork } from './client-network.js';

describe('clientNetwork', () => {
  it('IPv4 (y compris vue en IPv6 par Express) : l’adresse', () => {
    expect(clientNetwork('203.0.113.7')).toBe('203.0.113.7');
    expect(clientNetwork('::ffff:203.0.113.7')).toBe('203.0.113.7');
  });

  it('IPv6 : le /64, quelle que soit l’écriture', () => {
    const net = '2001:db8:aa:1::/64';
    expect(clientNetwork('2001:db8:aa:1::1')).toBe(net);
    expect(clientNetwork('2001:0db8:00aa:0001:ffff:ffff:ffff:ffff')).toBe(net);
    expect(clientNetwork('2001:DB8:AA:1:0:0:0:2')).toBe(net);
    expect(clientNetwork('2001:db8:aa:2::1')).not.toBe(net);
  });

  it('IPv6 compressée en tête ou en milieu de préfixe', () => {
    expect(clientNetwork('::1')).toBe('0:0:0:0::/64');
    expect(clientNetwork('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(clientNetwork('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
  });
});
