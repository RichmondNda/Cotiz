const MAPPED_IPV4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;

/** IPv4 vue en IPv6 par Express (`::ffff:203.0.113.7`) → `203.0.113.7` ; les autres adresses telles quelles. */
export function canonicalIp(ip: string): string {
  return MAPPED_IPV4.exec(ip)?.[1] ?? ip;
}
