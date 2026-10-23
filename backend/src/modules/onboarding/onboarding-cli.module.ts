import { Module } from '@nestjs/common';
import { SeedDevRequestsUseCase } from './application/seed-dev-requests.use-case.js';

/** Scripts d'exploitation du module onboarding (src/cli.ts) : demandes de création de développement. */
@Module({ providers: [SeedDevRequestsUseCase], exports: [SeedDevRequestsUseCase] })
export class OnboardingCliModule {}
