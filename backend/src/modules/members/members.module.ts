import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { IdentityModule } from '../identity/identity.public.js';
import { CreateEnrollmentUseCase } from './application/create-enrollment.use-case.js';
import { LookupMemberUseCase } from './application/lookup-member.use-case.js';
import { EnrollmentsController } from './http/enrollments.controller.js';
import { MembersController } from './http/members.controller.js';

/** Module members (endpoints.yaml : mb.*, en.* ; lot 2.3) : souscripteurs, inscriptions, codes à remettre. */
@Module({
  imports: [IdentityModule],
  controllers: [MembersController, EnrollmentsController],
  providers: [LookupMemberUseCase, CreateEnrollmentUseCase, QuotaService],
})
export class MembersModule {}
