import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ACTIVATION_CODE_ALPHABET } from './activation-code.js';

// Second facteur TOTP (RFC 6238 sur HOTP, RFC 4226) : HMAC-SHA1, 6 chiffres, pas de 30 s, comme les applications
// d'authentification courantes. Sans dépendance (node:crypto). Lot 4.7.

/** Durée d'un pas TOTP. */
export const TOTP_STEP_SECONDS = 30;
/** Pas acceptés de part et d'autre du pas courant (décalage d'horloge du téléphone). */
export const TOTP_WINDOW = 1;
const DIGITS = 6;
/** Secret de 160 bits (taille recommandée par la RFC 4226 pour SHA-1). */
const SECRET_BYTES = 20;

/** Nombre de codes de secours remis à la confirmation (affichés une fois). */
export const RECOVERY_CODES_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Base 32 (RFC 4648) sans remplissage, comme l'attendent les URL `otpauth://`. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32.charAt((value << (5 - bits)) & 31);
  return out;
}

/** Décode une base 32 (casse, espaces et `=` ignorés) ; lève une erreur sur un caractère hors alphabet. */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error('base 32 invalide');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Nouveau secret TOTP, en base 32. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(SECRET_BYTES));
}

/** Pas TOTP de l'instant donné. */
export function totpStep(now: Date): number {
  return Math.floor(now.getTime() / 1000 / TOTP_STEP_SECONDS);
}

/** Code HOTP du pas donné (RFC 4226 § 5.3), sur `DIGITS` chiffres. */
export function hotp(secret: Buffer, counter: number, algorithm: 'sha1' | 'sha256' | 'sha512' = 'sha1'): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

/**
 * Pas auquel le code correspond (pas courant ± TOTP_WINDOW), `null` sinon. Comparaison à temps constant. Le pas
 * renvoyé sert à refuser le rejeu d'un code déjà accepté.
 */
export function matchTotp(secretBase32: string, code: string, now: Date): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = totpStep(now);
  let matched: number | null = null;
  for (let step = current - TOTP_WINDOW; step <= current + TOTP_WINDOW; step++) {
    if (timingSafeEqual(Buffer.from(hotp(secret, step)), Buffer.from(code)) && matched === null) matched = step;
  }
  return matched;
}

/** URL `otpauth://totp/…` (format Key Uri de Google Authenticator), rendue en QR code par le front. */
export function otpauthUrl(input: { issuer: string; account: string; secret: string }): string {
  const label = `${encodeURIComponent(input.issuer)}:${encodeURIComponent(input.account)}`;
  const params = new URLSearchParams({
    secret: input.secret,
    issuer: input.issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Codes de secours : 10 caractères de l'alphabet sans ambiguïté, affichés `ABCDE-FGHJK`. */
export function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODES_COUNT }, () => {
    let code = '';
    for (let i = 0; i < RECOVERY_CODE_LENGTH; i++) {
      code += ACTIVATION_CODE_ALPHABET.charAt(randomInt(ACTIVATION_CODE_ALPHABET.length));
    }
    return `${code.slice(0, 5)}-${code.slice(5)}`;
  });
}

/** Forme hachée et comparée d'un code de secours : majuscules, sans tiret ni espace. */
export function normalizeRecoveryCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
