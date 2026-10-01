// newId() : UUID v7 (RFC 9562), triable par date de création. Compteur de 12 bits dans `rand_a` pour rester
// strictement croissant dans une même milliseconde ; si l'horloge recule, on garde la dernière milliseconde vue.

interface RandomSource {
  getRandomValues<T extends Uint8Array>(array: T): T;
}
// Web Crypto, présent dans les navigateurs et Node 20+.
const random = (globalThis as unknown as { crypto: RandomSource }).crypto;

let lastMs = -1;
let counter = 0;

function hex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

/** Horodatage UTC en millisecondes, sur 48 bits. */
const MAX_MS = 2 ** 48;

export function newId(now: number = Date.now()): string {
  if (!Number.isSafeInteger(now) || now < 0 || now >= MAX_MS)
    throw new RangeError(`newId : horodatage invalide (${String(now)})`);
  const bytes = random.getRandomValues(new Uint8Array(16));
  const view = new DataView(bytes.buffer);
  if (now > lastMs) {
    lastMs = now;
    // Bit de poids fort à 0 : marge pour incrémenter dans la milliseconde.
    counter = view.getUint16(6) & 0x7ff;
  } else if (++counter > 0xfff) {
    // Compteur épuisé : on avance d'une milliseconde (au plus 4 096 identifiants par milliseconde réelle).
    lastMs = Math.min(lastMs + 1, MAX_MS - 1);
    counter = 0;
  }
  // 48 bits d'horodatage : 16 bits de poids fort puis 32 bits de poids faible.
  view.setUint16(0, Math.floor(lastMs / 2 ** 32));
  view.setUint32(2, lastMs % 2 ** 32);
  view.setUint16(6, 0x7000 | counter);
  view.setUint8(8, 0x80 | (view.getUint8(8) & 0x3f));
  return hex(bytes);
}
