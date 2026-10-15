import { REFRESH_TOKEN_TTL_MS } from '../domain/login-policy.js';

/** Cookie du jeton de renouvellement (architecture/03) : jamais lisible par le JavaScript du front. */
export const REFRESH_COOKIE = 'cotiz_refresh';

export interface CookieResponse {
  cookie(name: string, value: string, options: Record<string, unknown>): unknown;
}

/** « Rester connecté » : cookie de 30 jours ; sinon cookie de session (effacé à la fermeture du navigateur). */
export function setRefreshCookie(res: CookieResponse, token: string, persistent: boolean): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/api/v1/auth',
    ...(persistent ? { maxAge: REFRESH_TOKEN_TTL_MS } : {}),
  });
}
