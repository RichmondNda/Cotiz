import { Module } from '@nestjs/common';
import { CodeService } from './application/code-service.js';
import { CreatePlatformOwnerUseCase } from './application/create-platform-owner.use-case.js';
import { IssueResetCodeUseCase } from './application/issue-reset-code.use-case.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Scripts d'exploitation du module identity (src/cli.ts). */
@Module({
  providers: [SecretHasher, CodeService, CreatePlatformOwnerUseCase, IssueResetCodeUseCase],
  exports: [CreatePlatformOwnerUseCase, IssueResetCodeUseCase],
})
export class IdentityCliModule {}
