import { Controller, Get, Param, Query } from '@nestjs/common';
import { GridQuery, InstallmentParams, ProjectParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetInstallmentUseCase } from '../application/get-installment.use-case.js';
import { ProjectGridUseCase } from '../application/project-grid.use-case.js';

/** Registre d'une association (lg.*) : grille, échéances ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid')
export class LedgerController {
  constructor(
    private readonly projectGrid: ProjectGridUseCase,
    private readonly getInstallment: GetInstallmentUseCase,
  ) {}

  @Get('projects/:pid/grid')
  @Endpoint('lg.grid', 'get')
  @Can('association.read')
  grid(@Param() params: unknown, @Query() query: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.projectGrid.execute(aid, pid, parseInput(GridQuery, query));
  }

  @Get('installments/:iid')
  @Endpoint('lg.inst', 'get')
  @Can('association.read')
  installment(@Param() params: unknown) {
    const { aid, iid } = parseInput(InstallmentParams, params);
    return this.getInstallment.execute(aid, iid);
  }
}
