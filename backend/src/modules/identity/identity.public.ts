// Surface publique du module identity : authentification des requêtes (gardes du module access, AppModule).
export { authenticatedSession, JwtGuard } from './http/jwt.guard.js';
export { type AccessClaims, AccessTokenSigner, type VerifiedAccess } from './infra/access-token-signer.js';
export { RevokedSessions } from './infra/revoked-sessions.js';
export { associationPersonNameOf, platformPersonContactsOf, platformPersonRefsOf } from './application/person-refs.js';
export { notifiableUsersOf } from './application/notifiable-users.js';
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
  activationCodesCountOf,
  type CodePosition,
  type CodesPage,
  SubscriberActivationCodes,
} from './application/subscriber-activation-codes.js';
export type { PreparedCode } from './application/code-service.js';
export { type UserProfile, type UserProfileChanges, UserProfiles } from './application/user-profiles.js';
