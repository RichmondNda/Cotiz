import { BlockList, isIP } from 'node:net';
import { canonicalIp } from './canonical-ip.js';

/**
 * Liste d'adresses ou de réseaux autorisés (`203.0.113.7, 10.0.0.0/8, 2001:db8::/32`) → test d'une adresse ;
 * `null` si une entrée est invalide (la configuration le refuse au démarrage). Une adresse absente est refusée.
 */
export function parseIpAllowList(raw: string): ((ip: string | null) => boolean) | null {
  const entries = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;
  const list = new BlockList();
  for (const entry of entries) {
    const [address = '', prefix, ...rest] = entry.split('/');
    const family = isIP(address);
    if (family === 0 || rest.length > 0) return null;
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const bits = /^\d{1,3}$/.test(prefix) ? Number(prefix) : NaN;
    if (!(bits >= 0 && bits <= (family === 4 ? 32 : 128))) return null;
    list.addSubnet(address, bits, type);
  }
  return (ip) => {
    if (!ip) return false;
    const address = canonicalIp(ip);
    const family = isIP(address);
    if (family === 0) return false;
    return list.check(address, family === 4 ? 'ipv4' : 'ipv6');
  };
}
