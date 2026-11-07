import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.public.js';
import { MembersModule } from '../members/members.public.js';
import { DeclarePaymentUseCase } from './application/declare-payment.use-case.js';
import { GetSubscriberPaymentUseCase } from './application/get-subscriber-payment.use-case.js';
import { GetInstallmentUseCase } from './application/get-installment.use-case.js';
import { GetPaymentUseCase } from './application/get-payment.use-case.js';
import { ListPaymentsUseCase } from './application/list-payments.use-case.js';
import { PreviewAllocationUseCase } from './application/preview-allocation.use-case.js';
import { ProjectGridUseCase } from './application/project-grid.use-case.js';
import { RejectPaymentUseCase } from './application/reject-payment.use-case.js';
import { RevertPaymentUseCase } from './application/revert-payment.use-case.js';
import { ValidatePaymentUseCase } from './application/validate-payment.use-case.js';
import { LedgerController } from './http/ledger.controller.js';
import { SubscriberPaymentsController } from './http/subscriber-payments.controller.js';

/** Module ledger (endpoints.yaml : lg.* ; lot 2.4) : grille, échéances, paiements, validation, rejet, annulation ;
 * espace souscripteur (me.alloc, me.declare, me.payment ; lot 3.3). */
@Module({
  imports: [IdentityModule, MembersModule],
  controllers: [LedgerController, SubscriberPaymentsController],
  providers: [
    ProjectGridUseCase,
    GetInstallmentUseCase,
    ListPaymentsUseCase,
    GetPaymentUseCase,
    ValidatePaymentUseCase,
    RejectPaymentUseCase,
    RevertPaymentUseCase,
    PreviewAllocationUseCase,
    DeclarePaymentUseCase,
    GetSubscriberPaymentUseCase,
  ],
})
export class LedgerModule {}
