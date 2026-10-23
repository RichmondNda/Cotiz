import { isIPv6 } from 'node:net';
import { canonicalIp } from './canonical-ip.js';

/**
 * Réseau d'un client pour une limitation de débit : l'adresse IPv4 elle-même, le /64 d'une adresse IPv6 (un accès
 * particulier en reçoit un entier ; compter par adresse laisserait 2^64 essais). `fe80::1%eth0` : zone ignorée.
 */
export function clientNetwork(ip: string): string {
  const address = canonicalIp(ip).split('%')[0] ?? '';
  if (!isIPv6(address)) return address;
  const [head = '', tail] = address.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups =
    tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
