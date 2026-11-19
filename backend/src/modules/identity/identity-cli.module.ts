import { Module } from '@nestjs/common';
import { CodeService } from './application/code-service.js';
import { CreatePlatformOwnerUseCase } from './application/create-platform-owner.use-case.js';
import { IssueResetCodeUseCase } from './application/issue-reset-code.use-case.js';
import { MfaFactors } from './application/mfa-factors.js';
import { SeedDevAccountsUseCase } from './application/seed-dev-accounts.use-case.js';
import { SubscriberAccounts } from './application/subscriber-accounts.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Scripts d'exploitation du module identity (src/cli.ts). */
@Module({
  providers: [
    SecretHasher,
    CodeService,
    SubscriberAccounts,
    CreatePlatformOwnerUseCase,
    IssueResetCodeUseCase,
    SeedDevAccountsUseCase,
    MfaFactors,
  ],
  // SubscriberAccounts : codes d'activation des inscriptions de développement (module members) ; MfaFactors : profil
  // lu par les PDF du worker (UserProfiles).
  exports: [CreatePlatformOwnerUseCase, IssueResetCodeUseCase, MfaFactors, SeedDevAccountsUseCase, SubscriberAccounts],
})
export class IdentityCliModule {}
