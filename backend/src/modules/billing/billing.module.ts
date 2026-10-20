import { Module } from '@nestjs/common';
import { ArchivePlanUseCase } from './application/archive-plan.use-case.js';
import { CreatePlanUseCase } from './application/create-plan.use-case.js';
import { DuplicatePlanUseCase } from './application/duplicate-plan.use-case.js';
import { ListPlansUseCase } from './application/list-plans.use-case.js';
import { ListPublicPlansUseCase } from './application/list-public-plans.use-case.js';
import { UpdatePlanUseCase } from './application/update-plan.use-case.js';
import { PlatformPlansController, PublicPlansController } from './http/plans.controller.js';

/** Module billing (lot 1.2) : plans (pub.plans, pf.plans, pf.plan.write, pf.plan.archive). */
@Module({
  controllers: [PublicPlansController, PlatformPlansController],
  providers: [
    ListPublicPlansUseCase,
    ListPlansUseCase,
    CreatePlanUseCase,
    UpdatePlanUseCase,
    ArchivePlanUseCase,
    DuplicatePlanUseCase,
  ],
})
export class BillingModule {}
