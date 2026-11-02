import { Module } from '@nestjs/common';
import { SeedDevPaymentsUseCase } from './application/seed-dev-payments.use-case.js';

/** Scripts d'exploitation du module ledger (src/cli.ts) : paiements de développement. */
@Module({ providers: [SeedDevPaymentsUseCase], exports: [SeedDevPaymentsUseCase] })
export class LedgerCliModule {}
