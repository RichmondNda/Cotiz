/** Cookie du jeton de renouvellement (architecture/03) : jamais lisible par le JavaScript du front. */
export const REFRESH_COOKIE = 'cotiz_refresh';

export interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
  clearCookie(name: string, options: Record<string, unknown>): unknown;
}

const OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/v1/auth' } as const;

/**
 * « Rester connecté » : cookie persistant jusqu'à la fin de la connexion (`maxAgeMs`) ; sinon (`null`) cookie de
 * session, effacé à la fermeture du navigateur.
 */
export function setRefreshCookie(res: CookieResponse, token: string, maxAgeMs: number | null): void {
  res.cookie(REFRESH_COOKIE, token, { ...OPTIONS, ...(maxAgeMs === null ? {} : { maxAge: Math.max(0, maxAgeMs) }) });
}

/** Déconnexion : le navigateur oublie le cookie (mêmes attributs, sinon il n'est pas effacé). */
export function clearRefreshCookie(res: CookieResponse): void {
  res.clearCookie(REFRESH_COOKIE, OPTIONS);
}

/** Jeton de renouvellement lu dans l'en-tête Cookie ; `undefined` s'il est absent ou vide. */
export function readRefreshCookie(header: string | undefined): string | undefined {
  for (const part of (header ?? '').split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1 || part.slice(0, separator).trim() !== REFRESH_COOKIE) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value) || undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}
