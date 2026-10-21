import { Module } from '@nestjs/common';
import { SeedDevMembershipsUseCase } from './application/seed-dev-memberships.use-case.js';

/** Scripts d'exploitation du module access (src/cli.ts) : appartenances de développement. */
@Module({ providers: [SeedDevMembershipsUseCase], exports: [SeedDevMembershipsUseCase] })
export class AccessCliModule {}
