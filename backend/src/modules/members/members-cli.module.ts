import { Module } from '@nestjs/common';
import { IdentityCliModule } from '../identity/identity.public.js';
import { SeedDevMembersUseCase } from './application/seed-dev-members.use-case.js';

/** Scripts d'exploitation du module members (src/cli.ts) : inscriptions de développement. */
@Module({ imports: [IdentityCliModule], providers: [SeedDevMembersUseCase], exports: [SeedDevMembersUseCase] })
export class MembersCliModule {}
