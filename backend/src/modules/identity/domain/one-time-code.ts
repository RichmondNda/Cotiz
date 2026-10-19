import { randomInt } from 'node:crypto';
import type { oneTimeCodes } from '@cotiz/db';
import { formatActivationCode, generateActivationCode, normalizeActivationCode } from './activation-code.js';

export type CodePurpose = (typeof oneTimeCodes.purpose.enumValues)[number];

/** Essais par code : au-delà, `too_many_attempts` et le code ne sert plus (architecture/03). */
export const MAX_CODE_ATTEMPTS = 5;

/** Format et durée de chaque usage (architecture/03-auth.md). */
export const CODE_RULES: Record<CodePurpose, { format: 'activation' | 'six_digits'; ttlMs: number }> = {
  activation: { format: 'activation', ttlMs: 72 * 3_600_000 },
  team_invite: { format: 'activation', ttlMs: 72 * 3_600_000 },
  staff_invite: { format: 'activation', ttlMs: 72 * 3_600_000 },
  password_reset: { format: 'six_digits', ttlMs: 15 * 60_000 },
};

/** Code tiré par le générateur cryptographique, sous sa forme normalisée (celle qui est hachée). */
export function generateCode(purpose: CodePurpose): string {
  return CODE_RULES[purpose].format === 'activation'
    ? generateActivationCode()
    : String(randomInt(1_000_000)).padStart(6, '0');
}

/** Forme affichée et transmise : `K7M4-P9QX`, ou les 6 chiffres. */
export function displayCode(purpose: CodePurpose, code: string): string {
  return CODE_RULES[purpose].format === 'activation' ? formatActivationCode(code) : code;
}

/** Forme comparée : saisie sans casse, tiret ni espace. */
export function normalizeCode(purpose: CodePurpose, input: string): string {
  return CODE_RULES[purpose].format === 'activation' ? normalizeActivationCode(input) : input.replace(/\s/g, '');
}
