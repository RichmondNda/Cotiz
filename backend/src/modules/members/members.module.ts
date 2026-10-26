import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { IdentityModule } from '../identity/identity.public.js';
import { ListActivationCodesUseCase } from './application/list-activation-codes.use-case.js';
import { MarkActivationCodeHandedUseCase } from './application/mark-activation-code-handed.use-case.js';
import { RegenerateActivationCodeUseCase } from './application/regenerate-activation-code.use-case.js';
import { ActivationCodesController } from './http/activation-codes.controller.js';
import { BulkEnrollUseCase } from './application/bulk-enroll.use-case.js';
import { CreateEnrollmentUseCase } from './application/create-enrollment.use-case.js';
import { GetMemberUseCase } from './application/get-member.use-case.js';
import { ListEnrollmentsUseCase } from './application/list-enrollments.use-case.js';
import { ListMembersUseCase } from './application/list-members.use-case.js';
import { LookupMemberUseCase } from './application/lookup-member.use-case.js';
import { MemberDirectory } from './application/member-directory.js';
import { MemberTimelineUseCase } from './application/member-timeline.use-case.js';
import { UpdateMemberUseCase } from './application/update-member.use-case.js';
import { WithdrawEnrollmentUseCase } from './application/withdraw-enrollment.use-case.js';
import { EnrollmentsController } from './http/enrollments.controller.js';
import { MembersController } from './http/members.controller.js';

/** Module members (endpoints.yaml : mb.*, en.* ; lot 2.3) : souscripteurs, inscriptions, codes à remettre. */
@Module({
  imports: [IdentityModule],
  controllers: [MembersController, EnrollmentsController, ActivationCodesController],
  providers: [
    LookupMemberUseCase,
    CreateEnrollmentUseCase,
    BulkEnrollUseCase,
    RegenerateActivationCodeUseCase,
    ListActivationCodesUseCase,
    MarkActivationCodeHandedUseCase,
    MemberDirectory,
    ListEnrollmentsUseCase,
    WithdrawEnrollmentUseCase,
    ListMembersUseCase,
    GetMemberUseCase,
    UpdateMemberUseCase,
    MemberTimelineUseCase,
    QuotaService,
  ],
})
export class MembersModule {}
