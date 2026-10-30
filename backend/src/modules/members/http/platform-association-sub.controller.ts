import { Controller, Get, Param, Query } from '@nestjs/common';
import { IdParams, ListQuery } from '@cotiz/contracts';
import { z } from 'zod';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { PlatformAssociationMembersUseCase } from '../application/platform-association-members.use-case.js';
import { PlatformAssociationProjectsUseCase } from '../application/platform-association-projects.use-case.js';

const MembersQuery = ListQuery.extend({ q: z.string().min(1).optional() });

/** pf.asso.sub : projets et membres d'une association, lus par la plateforme (connexion plateforme, lecture auditée). */
@Controller('platform/associations/:id')
export class PlatformAssociationSubController {
  constructor(
    private readonly associationProjects: PlatformAssociationProjectsUseCase,
    private readonly associationMembers: PlatformAssociationMembersUseCase,
  ) {}

  @Get('projects')
  @Endpoint('pf.asso.sub', 'projects')
  @Can('platform.associations.read')
  projects(@Param() params: unknown, @Query() query: unknown) {
    return this.associationProjects.execute(parseInput(IdParams, params).id, parseInput(ListQuery, query));
  }

  @Get('members')
  @Endpoint('pf.asso.sub', 'members')
  @Can('platform.associations.read')
  members(@Param() params: unknown, @Query() query: unknown) {
    return this.associationMembers.execute(parseInput(IdParams, params).id, parseInput(MembersQuery, query));
  }
}
