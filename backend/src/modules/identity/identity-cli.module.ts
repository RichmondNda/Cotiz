import { Module } from '@nestjs/common';
import { CodeService } from './application/code-service.js';
import { CreatePlatformOwnerUseCase } from './application/create-platform-owner.use-case.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Scripts d'exploitation du module identity (src/cli.ts). */
@Module({
  providers: [SecretHasher, CodeService, CreatePlatformOwnerUseCase],
  exports: [CreatePlatformOwnerUseCase],
})
export class IdentityCliModule {}
