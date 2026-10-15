import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { SessionFamilies } from './application/session-families.js';
import { SpaceAccess } from './application/space-access.js';
import { AuthController } from './http/auth.controller.js';
import { JwtGuard } from './http/jwt.guard.js';
import { AccessTokenSigner } from './infra/access-token-signer.js';
import { LoginThrottle } from './infra/login-throttle.js';
import { RevokedSessions } from './infra/revoked-sessions.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Module identity (lot 1.1) : connexion, renouvellement et déconnexion ; activation et mot de passe oublié aux étapes suivantes. */
@Module({
  controllers: [AuthController],
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
  ],
})
export class IdentityModule {}
