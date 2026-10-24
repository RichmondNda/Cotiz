import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssociationParams,
  CreateProjectInput,
  ENDPOINTS,
  ProjectParams,
  ProjectsQuery,
  SchedulePreviewInput,
} from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CreateProjectUseCase } from '../application/create-project.use-case.js';
import { GetProjectUseCase } from '../application/get-project.use-case.js';
import { ListProjectsUseCase } from '../application/list-projects.use-case.js';
import { PreviewScheduleUseCase } from '../application/preview-schedule.use-case.js';
import { UpdateProjectUseCase } from '../application/update-project.use-case.js';

const PatchBody = ENDPOINTS['pr.patch'].operations.patch.request.body;

/** Projets d'une association (pr.list, pr.create, pr.preview, pr.get, pr.patch) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/projects')
export class ProjectsController {
  constructor(
    private readonly listProjects: ListProjectsUseCase,
    private readonly createProject: CreateProjectUseCase,
    private readonly previewSchedule: PreviewScheduleUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
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

  @Patch(':pid')
  @Endpoint('pr.patch', 'patch')
  @Can('projects.manage')
  patch(@Param() params: unknown, @Body() body: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.updateProject.execute(aid, pid, parseInput(PatchBody, body));
  }
}
