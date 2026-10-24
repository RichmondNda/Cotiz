import { Module } from '@nestjs/common';
import { QuotaService } from '../billing/billing.public.js';
import { CreateProjectUseCase } from './application/create-project.use-case.js';
import { GetProjectUseCase } from './application/get-project.use-case.js';
import { ListProjectsUseCase } from './application/list-projects.use-case.js';
import { PreviewScheduleUseCase } from './application/preview-schedule.use-case.js';
import { UpdateProjectUseCase } from './application/update-project.use-case.js';
import { ProjectsController } from './http/projects.controller.js';

/** Module projects (endpoints.yaml : pr.list, pr.create, pr.preview, pr.get, pr.patch ; lot 2.2). */
@Module({
  controllers: [ProjectsController],
  providers: [
    ListProjectsUseCase,
    CreateProjectUseCase,
    PreviewScheduleUseCase,
    GetProjectUseCase,
    UpdateProjectUseCase,
    QuotaService,
  ],
})
export class ProjectsModule {}
