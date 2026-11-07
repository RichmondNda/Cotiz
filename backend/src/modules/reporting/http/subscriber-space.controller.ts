import { Controller, Get, Header, Param } from '@nestjs/common';
import { ProjectParamsMe } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetSubscriberDashboardUseCase } from '../application/get-subscriber-dashboard.use-case.js';
import { GetSubscriberProjectUseCase } from '../application/get-subscriber-project.use-case.js';
import { ListSubscriberProjectsUseCase } from '../application/list-subscriber-projects.use-case.js';

/**
 * Espace souscripteur (lot 3.2), lecture seule : tableau de bord (me.dash), projets (me.projects) et un projet
 * (me.project). Toujours la personne du jeton (espace subscriber) ; propre à la personne : jamais en cache HTTP partagé.
 */
@Controller('me')
export class SubscriberSpaceController {
  constructor(
    private readonly dashboard: GetSubscriberDashboardUseCase,
    private readonly projects: ListSubscriberProjectsUseCase,
    private readonly project: GetSubscriberProjectUseCase,
  ) {}

  @Get('dashboard')
  @Endpoint('me.dash', 'get')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  getDashboard() {
    return this.dashboard.execute();
  }

  @Get('projects')
  @Endpoint('me.projects', 'list')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  listProjects() {
    return this.projects.execute();
  }

  @Get('projects/:pid')
  @Endpoint('me.project', 'get')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  getProject(@Param() params: unknown) {
    return this.project.execute(parseInput(ProjectParamsMe, params).pid);
  }
}
