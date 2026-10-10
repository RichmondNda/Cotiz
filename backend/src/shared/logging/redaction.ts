/** Valeur substituée à toute donnée masquée dans les journaux. */
export const MASKED = '[masqué]';

/**
 * Champs sensibles, sur le nom normalisé (minuscules, sans séparateur) : mot de passe, code, téléphone, jetons, secrets
 * et leurs empreintes ou formes chiffrées (colonnes de docs/specs/schema.sql : password_hash, code_hash,
 * code_encrypted, secret_encrypted, refresh_token_hash, key_hash, phone_e164…), identifiant d'utilisateur (pseudonymisé
 * par le logger, jamais en clair).
 */
const SENSITIVE_KEYS = new Set(['code', 'pin', 'tel', 'msisdn', 'cookie', 'setcookie', 'dsn']);
/** Tout nom qui contient l'un de ces mots : newPassword, x-api-key, phoneE164, totpSecret, proxy-authorization… */
const SENSITIVE_PARTS = ['password', 'passwd', 'pwd', 'token', 'secret', 'phone', 'otp', 'apikey', 'authorization'];
/** Tout nom qui finit par l'un de ces mots : activationCode, keyHash, codeEncrypted, actorUserId… */
const SENSITIVE_SUFFIXES = ['code', 'hash', 'encrypted', 'userid', 'credentials'];
/** Codes qui ne sont pas des secrets : catalogue d'erreurs, statut HTTP, pays, devise. */
const SAFE_CODES = new Set(['errorcode', 'statuscode', 'countrycode', 'currencycode']);

const normalize = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isSensitiveKey(key: string): boolean {
  const k = normalize(key);
  if (SAFE_CODES.has(k)) return false;
  return (
    SENSITIVE_KEYS.has(k) ||
    SENSITIVE_PARTS.some((part) => k.includes(part)) ||
    SENSITIVE_SUFFIXES.some((suffix) => k.endsWith(suffix))
  );
}

/**
 * Numéros de téléphone dans un texte libre : international (`+225 07 07 07 07 07`, `+2250707070707`) ou national à
 * 10 chiffres (`07 07 07 07 07`). Jamais au milieu d'un identifiant (UUID, horodatage) : ni lettre, ni chiffre, ni
 * tiret, ni deux-points autour.
 */
const PHONE_PATTERNS = [
  /(?<![\w+:-])\+\d{1,3}(?:[ .-]?\d){6,14}(?![\w:-])/g,
  /(?<![\w+:-])0\d(?:[ .-]?\d{2}){4}(?![\w:-])/g,
];

export function maskPhones(text: string): string {
  return PHONE_PATTERNS.reduce((out, pattern) => out.replace(pattern, MASKED), text);
}

interface SqlError extends Error {
  code: string;
  table?: string;
  constraint?: string;
  column?: string;
  routine?: string;
}

/** Erreur PostgreSQL d'origine (Drizzle l'enveloppe dans `cause`), reconnue à son code SQLSTATE. */
export function sqlErrorOf(error: unknown): SqlError | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e as SqlError;
  }
  return undefined;
}

/** Cadres de la pile, sans les lignes de message (qui, pour Drizzle, contiennent la requête et ses paramètres). */
export const stackFrames = (error: Error) => (error.stack ?? '').split('\n').filter((line) => /^\s+at /.test(line));

export interface SerializedError {
  type: string;
  message?: string;
  sqlstate?: string;
  table?: string;
  constraint?: string;
  column?: string;
  routine?: string;
  stack: string[];
}

/**
 * Erreur journalisable. Erreur SQL (ou enveloppe Drizzle) : SQLSTATE, table, contrainte, colonne, routine et pile,
 * jamais le message ni le détail PostgreSQL, ni la requête, ni ses paramètres. Autre erreur : message, téléphones
 * masqués. Jamais les propriétés libres de l'erreur.
 */
export function serializeError(error: unknown): SerializedError {
  if (!(error instanceof Error)) return { type: typeof error, stack: [] };
  const sql = sqlErrorOf(error);
  const isQuery = sql !== undefined || 'query' in error || 'params' in error;
  const fields = sql
    ? { sqlstate: sql.code, table: sql.table, constraint: sql.constraint, column: sql.column, routine: sql.routine }
    : {};
  return {
    type: error.name,
    ...(isQuery ? {} : { message: maskPhones(error.message) }),
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    stack: stackFrames(error),
  };
}

const MAX_DEPTH = 8;

/**
 * Copie journalisable d'une valeur : champs sensibles masqués à toute profondeur, téléphones masqués dans les textes,
 * erreurs sérialisées par `serializeError`. Ne modifie jamais l'original.
 */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return maskPhones(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[cycle]';
  if (depth >= MAX_DEPTH) return '[profondeur]';
  seen.add(value);
  const out = Array.isArray(value)
    ? value.map((item) => redact(item, depth + 1, seen))
    : Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? MASKED : redact(item, depth + 1, seen)]),
      );
  seen.delete(value);
  return out;
}
