// Règles de connexion (architecture/03-auth.md).

/** Échecs consécutifs qui verrouillent un identifiant. */
export const MAX_FAILED_LOGINS = 5;
/** Durée du verrouillage, et fenêtre dans laquelle les échecs se cumulent. */
export const LOGIN_LOCK_MS = 15 * 60_000;
/** Jeton d'accès (JWT EdDSA). */
export const ACCESS_TOKEN_TTL_MS = 15 * 60_000;
/** Jeton de réinitialisation (auth.verify → auth.reset) : il peut survivre jusqu'à 10 min à son code. */
export const RESET_TOKEN_TTL_MS = 10 * 60_000;
/** Durée ABSOLUE d'une connexion : les rotations ne la prolongent pas (30 jours au plus après la connexion). */
export const REFRESH_TOKEN_TTL_MS = 30 * 86_400_000;

/**
 * Forme canonique d'un identifiant de connexion : email en minuscules (users.email est citext), téléphone E.164 tel
 * quel. Sert de clé au verrouillage, qui doit être le même quelle que soit la casse saisie.
 */
export function canonicalIdentifier(identifier: string): { kind: 'email' | 'phone'; value: string } {
  return identifier.includes('@')
    ? { kind: 'email', value: identifier.toLowerCase() }
    : { kind: 'phone', value: identifier };
}
