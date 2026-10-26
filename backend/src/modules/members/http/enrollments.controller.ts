import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { CreateEnrollmentInput, EnrollmentCreated, IdParams, ProjectParams } from '@cotiz/contracts';
import { z } from 'zod';
import { Can, Endpoint, idempotentReplay, parseInput, ReplayInHandler } from '../../../shared/http/index.js';
import { CreateEnrollmentUseCase } from '../application/create-enrollment.use-case.js';

/** Ce que le rejeu retrouve de l'opération mémorisée : l'inscription créée, jamais le code. */
const Reference = z.object({ enrollmentId: IdParams.shape.id });

/** Inscriptions aux projets d'une association (en.*) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid')
export class EnrollmentsController {
  constructor(private readonly createEnrollment: CreateEnrollmentUseCase) {}

  // Réponse avec le code d'activation : seul l'identifiant de l'inscription est mémorisé, le rejeu reconstruit le reste.
  @Post('projects/:pid/enrollments')
  @HttpCode(201)
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
}
