import { Module } from '@nestjs/common';
import { SeedDevContractsUseCase } from './application/seed-dev-contracts.use-case.js';

/** Scripts d'exploitation du module contracts (src/cli.ts) : contrats de développement. */
@Module({ providers: [SeedDevContractsUseCase], exports: [SeedDevContractsUseCase] })
export class ContractsCliModule {}
