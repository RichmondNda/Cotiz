import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  AssociationParams,
  CreateProjectInput,
  ENDPOINTS,
  ProjectParams,
  ProjectsQuery,
  SchedulePreviewInput,
} from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CloseProjectUseCase, PublishProjectUseCase } from '../application/change-project-status.use-case.js';
import { CreateProjectUseCase } from '../application/create-project.use-case.js';
import { DeleteProjectUseCase } from '../application/delete-project.use-case.js';
import { DuplicateProjectUseCase } from '../application/duplicate-project.use-case.js';
import { GetProjectOverviewUseCase } from '../application/get-project-overview.use-case.js';
import { GetProjectUseCase } from '../application/get-project.use-case.js';
import { ListProjectsUseCase } from '../application/list-projects.use-case.js';
import { PreviewScheduleUseCase } from '../application/preview-schedule.use-case.js';
import { UpdateProjectUseCase } from '../application/update-project.use-case.js';

const PatchBody = ENDPOINTS['pr.patch'].operations.patch.request.body;

/** Projets d'une association (pr.list, pr.create, pr.preview, pr.get, pr.patch, pr.lifecycle,
 * pr.delete, pr.overview) ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/projects')
export class ProjectsController {
  constructor(
    private readonly listProjects: ListProjectsUseCase,
    private readonly createProject: CreateProjectUseCase,
    private readonly previewSchedule: PreviewScheduleUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly publishProject: PublishProjectUseCase,
    private readonly closeProject: CloseProjectUseCase,
    private readonly duplicateProject: DuplicateProjectUseCase,
    private readonly deleteProject: DeleteProjectUseCase,
    private readonly getOverview: GetProjectOverviewUseCase,
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

  @Post(':pid/publish')
  @Endpoint('pr.lifecycle', 'publish')
  @Can('projects.manage')
  @HttpCode(200)
  publish(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.publishProject.execute(aid, pid);
  }

  @Post(':pid/close')
  @Endpoint('pr.lifecycle', 'close')
  @Can('projects.manage')
  @HttpCode(200)
  close(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.closeProject.execute(aid, pid);
  }

  @Post(':pid/duplicate')
  @Endpoint('pr.lifecycle', 'duplicate')
  @Can('projects.manage')
  @HttpCode(201)
  duplicate(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.duplicateProject.execute(aid, pid);
  }

  @Delete(':pid')
  @Endpoint('pr.delete', 'remove')
  @Can('projects.manage')
  @HttpCode(204)
  async remove(@Param() params: unknown): Promise<void> {
    const { aid, pid } = parseInput(ProjectParams, params);
    await this.deleteProject.execute(aid, pid);
  }

  @Get(':pid/overview')
  @Endpoint('pr.overview', 'get')
  @Can('association.read')
  overview(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.getOverview.execute(aid, pid);
  }
}
