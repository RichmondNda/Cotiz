import { Module } from '@nestjs/common';
import { SeedDevAssociationsUseCase } from './application/seed-dev-associations.use-case.js';

/** Scripts d'exploitation du module tenancy (src/cli.ts) : associations de développement. */
@Module({ providers: [SeedDevAssociationsUseCase], exports: [SeedDevAssociationsUseCase] })
export class TenancyCliModule {}
