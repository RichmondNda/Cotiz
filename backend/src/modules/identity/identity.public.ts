// Surface publique du module identity : authentification des requêtes (gardes du module access, AppModule).
export { authenticatedSession, JwtGuard } from './http/jwt.guard.js';
export { type AccessClaims, AccessTokenSigner } from './infra/access-token-signer.js';
export { RevokedSessions } from './infra/revoked-sessions.js';
export { platformPersonContactsOf, platformPersonRefsOf } from './application/person-refs.js';
export { platformManagerActivityOf } from './application/session-activity.js';
export { IdentityModule } from './identity.module.js';
export { IdentityCliModule } from './identity-cli.module.js';
export { type ManagerAccount, ManagerAccounts, type ManagerContact } from './application/manager-accounts.js';
export {
  accountByPhone,
  accountMatches,
  type IdentityChanges,
  type NewSubscriber,
  type PhoneAccount,
  SubscriberAccounts,
  type SubscriberContact,
} from './application/subscriber-accounts.js';
export {
  type CodePosition,
  type CodesPage,
  SubscriberActivationCodes,
} from './application/subscriber-activation-codes.js';
export type { PreparedCode } from './application/code-service.js';
