import { Body, Controller, Get, Header, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import {
  AssociationParams,
  BulkEnrollmentInput,
  CreateEnrollmentInput,
  EnrollmentCreated,
  EnrollmentIdParams,
  EnrollmentsQuery,
  IdParams,
  ProjectParams,
  WithdrawInput,
} from '@cotiz/contracts';
import { z } from 'zod';
import { Can, Endpoint, idempotentReplay, parseInput, ReplayInHandler } from '../../../shared/http/index.js';
import { BulkEnrollUseCase } from '../application/bulk-enroll.use-case.js';
import { CreateEnrollmentUseCase } from '../application/create-enrollment.use-case.js';
import { ListEnrollmentsUseCase } from '../application/list-enrollments.use-case.js';
import { WithdrawEnrollmentUseCase } from '../application/withdraw-enrollment.use-case.js';

/** Ce que le rejeu retrouve de l'opération mémorisée : l'inscription créée, jamais le code. */
const Reference = z.object({ enrollmentId: IdParams.shape.id });

/** Enveloppe du lot : chaque ligne est validée à part (BulkEnrollmentRow), une ligne invalide est rapportée. */
const BulkEnvelope = BulkEnrollmentInput.extend({ rows: z.array(z.unknown()).min(1).max(200) });

/** Inscriptions aux projets d'une association (en.*) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid')
export class EnrollmentsController {
  constructor(
    private readonly createEnrollment: CreateEnrollmentUseCase,
    private readonly bulkEnroll: BulkEnrollUseCase,
    private readonly listEnrollments: ListEnrollmentsUseCase,
    private readonly withdrawEnrollment: WithdrawEnrollmentUseCase,
  ) {}

  @Get('projects/:pid/enrollments')
  @Endpoint('en.list', 'list')
  @Can('association.read')
  list(@Param() params: unknown, @Query() query: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.listEnrollments.execute(aid, pid, parseInput(EnrollmentsQuery, query));
  }

  // Réponse avec le code d'activation : seul l'identifiant de l'inscription est mémorisé, le rejeu reconstruit le reste.
  @Post('projects/:pid/enrollments')
  @HttpCode(201)
  @Header('Cache-Control', 'no-store')
  @Endpoint('en.create', 'create')
  @Can('members.manage')
  @ReplayInHandler((body) => ({ enrollmentId: (body as z.infer<typeof EnrollmentCreated>).enrollment.id }))
  create(@Param() params: unknown, @Body() body: unknown, @Req() request: object) {
    const { aid, pid } = parseInput(ProjectParams, params);
    const input = parseInput(CreateEnrollmentInput, body);
    const replay = idempotentReplay(request);
    return replay
      ? this.createEnrollment.replay(aid, pid, Reference.parse(replay.reference))
      : this.createEnrollment.execute(aid, pid, input);
  }

  // Rapport sans code d'activation : mémorisé et rejoué tel quel (Idempotency-Key).
  @Post('enrollments/bulk')
  @HttpCode(200)
  @Endpoint('en.bulk', 'create')
  @Can('members.manage')
  bulk(@Param() params: unknown, @Body() body: unknown) {
    return this.bulkEnroll.execute(parseInput(AssociationParams, params).aid, parseInput(BulkEnvelope, body));
  }

  @Post('enrollments/:eid/withdraw')
  @HttpCode(200)
  @Endpoint('en.withdraw', 'withdraw')
  @Can('members.manage')
  withdraw(@Param() params: unknown, @Body() body: unknown) {
    const { aid, eid } = parseInput(EnrollmentIdParams, params);
    return this.withdrawEnrollment.execute(aid, eid, parseInput(WithdrawInput, body ?? {}));
  }
}
