import { randomInt } from 'node:crypto';

/** Alphabet sans ambiguïté des codes d'activation et d'invitation (architecture/03-auth.md) : ni 0/O, ni 1/I/L. */
export const ACTIVATION_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

const LENGTH = 8;

/** Code d'activation de 8 caractères (`K7M4P9QX`), tiré par le générateur cryptographique. */
export function generateActivationCode(): string {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ACTIVATION_CODE_ALPHABET.charAt(randomInt(ACTIVATION_CODE_ALPHABET.length));
  return code;
}

/** Forme affichée et transmise : `K7M4-P9QX`. */
export function formatActivationCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** Forme hachée et comparée : majuscules, sans tiret ni espace. */
export function normalizeActivationCode(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}
