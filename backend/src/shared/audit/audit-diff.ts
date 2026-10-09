/** Valeur enregistrée à la place d'un champ secret. */
export const MASKED = '[masqué]';

/**
 * Champs jamais écrits au journal (CLAUDE.md, règle 10) : nom finissant par password, secret, token, hash,
 * encrypted, code, pin, otp ou key, quelle que soit la casse, avec ou sans `_` (`activationCode`, `api_key`,
 * `privateKey`, `passwordHash`). Sauf les codes et clés qui ne sont pas des secrets (liste ci-dessous).
 */
const SECRET_SUFFIX = /(password|secret|token|hash|encrypted|code|pin|otp|key)$/;
const NOT_SECRET = new Set([
  'reasoncode',
  'rejectionreasoncode',
  'postalcode',
  'currencycode',
  'countrycode',
  'statuscode',
  'laststatuscode',
  'idempotencykey',
  'dedupekey',
  'objectkey',
]);

function isSecret(field: string): boolean {
  const normalized = field.toLowerCase().replace(/_/g, '');
  return SECRET_SUFFIX.test(normalized) && !NOT_SECRET.has(normalized);
}

/** Téléphones (`phone`, `phoneE164`, `contact_phone`…) : masqués partiellement (architecture/13, règle 10). */
const isPhone = (field: string) => field.toLowerCase().includes('phone');

/**
 * `+2250708091011` → `+225 07 •• •• •• 11` (format de deliveries.recipient_masked) ; autre indicatif : `+33•••••••78` ;
 * sans indicatif : seuls les deux derniers chiffres restent. Une valeur qui n'est pas une chaîne est masquée.
 */
export function maskPhone(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return MASKED;
  const ivorian = /^\+225(\d{2})\d{6}(\d{2})$/.exec(value);
  if (ivorian) return `+225 ${ivorian[1] ?? ''} •• •• •• ${ivorian[2] ?? ''}`;
  if (value.length <= 4) return '•'.repeat(value.length);
  const head = value.startsWith('+') ? value.slice(0, 3) : '';
  return `${head}${'•'.repeat(value.length - head.length - 2)}${value.slice(-2)}`;
}

/** Valeur d'un champ telle qu'écrite au journal : secret masqué, téléphone masqué partiellement. */
function protect(field: string, value: unknown): unknown {
  if (isSecret(field)) return MASKED;
  if (isPhone(field)) return maskPhone(value);
  return value;
}

type Fields = Record<string, unknown>;

/** Valeur JSON enregistrable : dates en instant ISO, bigint en nombre (chaîne au-delà de 2^53), champs protégés. */
function normalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isSafeInteger(n) ? n : value.toString();
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, protect(key, normalize(v))]));
  }
  return value;
}

/** JSON canonique : clés triées à tous les niveaux, pour comparer par contenu. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return value === undefined ? 'undefined' : JSON.stringify(value);
}

/**
 * Avant/après d'une entrée d'audit, limités aux champs modifiés (schema.sql : audit_logs.before/after), secrets
 * masqués, téléphones masqués partiellement (comparaison sur les valeurs réelles). Création (`before` null) : tout l'après ; annulation (`after` null) : tout l'avant ; consultation : rien.
 */
export function auditDiff(
  before: Fields | null | undefined,
  after: Fields | null | undefined,
): { before: Fields | null; after: Fields | null } {
  if (!before || !after) {
    return {
      before: before ? (normalize(before) as Fields) : null,
      after: after ? (normalize(after) as Fields) : null,
    };
  }
  const changed: { before: Fields; after: Fields } = { before: {}, after: {} };
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const was = normalize(Object.hasOwn(before, key) ? before[key] : null);
    const now = normalize(Object.hasOwn(after, key) ? after[key] : null);
    if (canonical(was) === canonical(now)) continue;
    changed.before[key] = protect(key, was);
    changed.after[key] = protect(key, now);
  }
  return changed;
}
