import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import {
  AssociationParams,
  CreateProjectInput,
  ProjectParams,
  ProjectsQuery,
  SchedulePreviewInput,
} from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CreateProjectUseCase } from '../application/create-project.use-case.js';
import { GetProjectUseCase } from '../application/get-project.use-case.js';
import { ListProjectsUseCase } from '../application/list-projects.use-case.js';
import { PreviewScheduleUseCase } from '../application/preview-schedule.use-case.js';

/** Projets d'une association (pr.list, pr.create, pr.preview, pr.get) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/projects')
export class ProjectsController {
  constructor(
    private readonly listProjects: ListProjectsUseCase,
    private readonly createProject: CreateProjectUseCase,
    private readonly previewSchedule: PreviewScheduleUseCase,
    private readonly getProject: GetProjectUseCase,
  ) {}

  @Get()
  @Endpoint('pr.list', 'list')
  @Can('association.read')
  list(@Param() params: unknown, @Query() query: unknown) {
    return this.listProjects.execute(parseInput(AssociationParams, params).aid, parseInput(ProjectsQuery, query));
  }

  @Post()
  @Endpoint('pr.create', 'create')
  @Can('projects.manage')
  @HttpCode(201)
  create(@Param() params: unknown, @Body() body: unknown) {
    return this.createProject.execute(parseInput(AssociationParams, params).aid, parseInput(CreateProjectInput, body));
  }

  @Post('schedule-preview')
  @Endpoint('pr.preview', 'preview')
  @Can('projects.manage')
  @HttpCode(200)
  preview(@Param() params: unknown, @Body() body: unknown) {
    return this.previewSchedule.execute(
      parseInput(AssociationParams, params).aid,
      parseInput(SchedulePreviewInput, body),
    );
  }

  @Get(':pid')
  @Endpoint('pr.get', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.getProject.execute(aid, pid);
  }
}
