import { Module } from '@nestjs/common';
import { ActivateAccountUseCase } from './application/activate-account.use-case.js';
import { CodeService } from './application/code-service.js';
import { GetMeUseCase } from './application/get-me.use-case.js';
import { IssuePlatformResetCodeUseCase } from './application/issue-platform-reset-code.use-case.js';
import { ListPlatformResetRequestsUseCase } from './application/list-platform-reset-requests.use-case.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { ManagerAccounts } from './application/manager-accounts.js';
import { SubscriberAccounts } from './application/subscriber-accounts.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { RequestPasswordResetUseCase } from './application/request-password-reset.use-case.js';
import { ResetPasswordUseCase } from './application/reset-password.use-case.js';
import { SessionFamilies } from './application/session-families.js';
import { VerifyResetCodeUseCase } from './application/verify-reset-code.use-case.js';
import { SessionOpener } from './application/session-opener.js';
import { SpaceAccess } from './application/space-access.js';
import { AuthController } from './http/auth.controller.js';
import { MeController } from './http/me.controller.js';
import { PlatformResetsController } from './http/platform-resets.controller.js';
import { JwtGuard } from './http/jwt.guard.js';
import { AccessTokenSigner } from './infra/access-token-signer.js';
import { LoginThrottle } from './infra/login-throttle.js';
import { RevokedSessions } from './infra/revoked-sessions.js';
import { SecretHasher } from './infra/secret-hasher.js';
import { UncountedCodeAttempts } from './infra/uncounted-code-attempts.js';

/**
 * Module identity (lot 1.1) : connexion, renouvellement, déconnexion, `GET /me`, activation et mot de passe oublié ;
 * demandes des gestionnaires traitées par le super-admin (pf.resets, lot 1.4).
 */
@Module({
  controllers: [AuthController, MeController, PlatformResetsController],
  providers: [
    SecretHasher,
    AccessTokenSigner,
    LoginThrottle,
    RevokedSessions,
    SessionFamilies,
    SpaceAccess,
    JwtGuard,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetMeUseCase,
    CodeService,
    SessionOpener,
    ActivateAccountUseCase,
    UncountedCodeAttempts,
    RequestPasswordResetUseCase,
    VerifyResetCodeUseCase,
    ResetPasswordUseCase,
    ManagerAccounts,
    SubscriberAccounts,
    ListPlatformResetRequestsUseCase,
    IssuePlatformResetCodeUseCase,
  ],
  // Garde d'authentification, enregistrée globalement par AppModule ; comptes des gestionnaires (onboarding).
  exports: [JwtGuard, ManagerAccounts, SubscriberAccounts],
})
export class IdentityModule {}
