import { Controller, Get, Param, Query } from '@nestjs/common';
import { PeriodQuery, ProjectParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetProjectReportUseCase } from '../application/get-project-report.use-case.js';

/** rp.report : rapport d'un projet ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/projects/:pid/report')
export class ProjectReportController {
  constructor(private readonly report: GetProjectReportUseCase) {}

  @Get()
  @Endpoint('rp.report', 'get')
  @Can('reports.read')
  get(@Param() params: unknown, @Query() query: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.report.execute(aid, pid, parseInput(PeriodQuery, query));
  }
}
