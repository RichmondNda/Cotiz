import { Module } from '@nestjs/common';
import { LoginUseCase } from './application/login.use-case.js';
import { AuthController } from './http/auth.controller.js';
import { AccessTokenSigner } from './infra/access-token-signer.js';
import { LoginThrottle } from './infra/login-throttle.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Module identity (lot 1.1) : connexion ; renouvellement, activation et mot de passe oublié aux étapes suivantes. */
@Module({
  controllers: [AuthController],
  providers: [SecretHasher, AccessTokenSigner, LoginThrottle, LoginUseCase],
})
export class IdentityModule {}
