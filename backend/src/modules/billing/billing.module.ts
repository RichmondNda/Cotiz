import { Module } from '@nestjs/common';
import { ArchivePlanUseCase } from './application/archive-plan.use-case.js';
import { ChangePlanUseCase } from './application/change-plan.use-case.js';
import { CreatePlanUseCase } from './application/create-plan.use-case.js';
import { DuplicatePlanUseCase } from './application/duplicate-plan.use-case.js';
import { ListPlansUseCase } from './application/list-plans.use-case.js';
import { ListPublicPlansUseCase } from './application/list-public-plans.use-case.js';
import { QuotaService } from './application/quota.service.js';
import { UpdatePlanUseCase } from './application/update-plan.use-case.js';
import { PlatformPlansController, PublicPlansController } from './http/plans.controller.js';
import { PlatformSubscriptionsController } from './http/subscriptions.controller.js';

/**
 * Module billing (lot 1.2) : plans (pub.plans, pf.plans, pf.plan.write, pf.plan.archive) et quotas ; changement de
 * plan d'une association (pf.asso.plan, lot 1.4).
 */
@Module({
  controllers: [PublicPlansController, PlatformPlansController, PlatformSubscriptionsController],
  providers: [
    ListPublicPlansUseCase,
    ListPlansUseCase,
    CreatePlanUseCase,
    UpdatePlanUseCase,
    ArchivePlanUseCase,
    DuplicatePlanUseCase,
    ChangePlanUseCase,
    QuotaService,
  ],
  exports: [QuotaService],
})
export class BillingModule {}
