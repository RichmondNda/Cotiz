import { Module } from '@nestjs/common';
import { LookupMemberUseCase } from './application/lookup-member.use-case.js';
import { MembersController } from './http/members.controller.js';

/** Module members (endpoints.yaml : mb.*, en.* ; lot 2.3) : souscripteurs, inscriptions, codes à remettre. */
@Module({
  controllers: [MembersController],
  providers: [LookupMemberUseCase],
})
export class MembersModule {}
