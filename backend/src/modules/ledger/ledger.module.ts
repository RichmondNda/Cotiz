import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { MembersModule } from '../members/members.public.js';
import { GetInstallmentUseCase } from './application/get-installment.use-case.js';
import { GetPaymentUseCase } from './application/get-payment.use-case.js';
import { ListPaymentsUseCase } from './application/list-payments.use-case.js';
import { ProjectGridUseCase } from './application/project-grid.use-case.js';
import { LedgerController } from './http/ledger.controller.js';

/** Module ledger (endpoints.yaml : lg.* ; lot 2.4) : grille, échéances, paiements, validation. */
@Module({
  imports: [IdentityModule, MembersModule],
  controllers: [LedgerController],
  providers: [ProjectGridUseCase, GetInstallmentUseCase, ListPaymentsUseCase, GetPaymentUseCase],
})
export class LedgerModule {}
