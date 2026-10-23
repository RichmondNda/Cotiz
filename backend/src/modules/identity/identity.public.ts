// Surface publique du module identity : authentification des requêtes (gardes du module access, AppModule).
export { authenticatedSession, JwtGuard } from './http/jwt.guard.js';
export { type AccessClaims, AccessTokenSigner } from './infra/access-token-signer.js';
export { RevokedSessions } from './infra/revoked-sessions.js';
export { platformPersonRefsOf } from './application/person-refs.js';
