import { createHash, randomBytes } from 'node:crypto';

/** Jeton de renouvellement opaque de 256 bits (base64url) ; seul son SHA-256 est stocké (sessions.refresh_token_hash). */
export function newRefreshToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashRefreshToken(token) };
}

export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
