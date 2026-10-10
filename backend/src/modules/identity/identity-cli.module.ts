import { Module } from '@nestjs/common';
import { CreatePlatformOwnerUseCase } from './application/create-platform-owner.use-case.js';
import { SecretHasher } from './infra/secret-hasher.js';

/** Scripts d'exploitation du module identity (src/cli.ts). */
@Module({
  providers: [SecretHasher, CreatePlatformOwnerUseCase],
  exports: [CreatePlatformOwnerUseCase],
})
export class IdentityCliModule {}
