import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { ENDPOINTS, ProjectParamsMe } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetSubscriberDashboardUseCase } from '../application/get-subscriber-dashboard.use-case.js';
import { GetSubscriberHistoryUseCase } from '../application/get-subscriber-history.use-case.js';
import { GetSubscriberProjectUseCase } from '../application/get-subscriber-project.use-case.js';
import { ListSubscriberProjectsUseCase } from '../application/list-subscriber-projects.use-case.js';

/**
 * Espace souscripteur (lots 3.2 et 3.4), lecture seule : tableau de bord (me.dash), projets (me.projects), un projet
 * (me.project) et historique (me.history). Toujours la personne du jeton (espace subscriber) ; propre à la personne : jamais en cache HTTP partagé.
 */
@Controller('me')
export class SubscriberSpaceController {
  constructor(
    private readonly dashboard: GetSubscriberDashboardUseCase,
    private readonly projects: ListSubscriberProjectsUseCase,
    private readonly project: GetSubscriberProjectUseCase,
    private readonly history: GetSubscriberHistoryUseCase,
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

  @Get('history')
  @Endpoint('me.history', 'list')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  listHistory(@Query() query: unknown) {
    return this.history.list(parseInput(HISTORY.list.request.query, query));
  }

  @Get('history/series')
  @Endpoint('me.history', 'series')
  @Can('subscriber.self')
  @Header('Cache-Control', 'no-store')
  getHistorySeries(@Query() query: unknown) {
    return this.history.series(parseInput(HISTORY.series.request.query, query));
  }
}

const HISTORY = ENDPOINTS['me.history'].operations;
