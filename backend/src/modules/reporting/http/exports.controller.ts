import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, CreateExportInput } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetExportUseCase } from '../application/get-export.use-case.js';
import { RequestExportUseCase } from '../application/request-export.use-case.js';

/** rp.export (lot 4.6) : export asynchrone demandé puis suivi ; association lue dans l'URL (MembershipGuard). */
@Controller('associations/:aid/exports')
export class ExportsController {
  constructor(
    private readonly requestExport: RequestExportUseCase,
    private readonly getExport: GetExportUseCase,
  ) {}

  @Post()
  @Endpoint('rp.export', 'create')
  @Can('reports.export')
  @HttpCode(202)
  create(@Param() params: unknown, @Body() body: unknown) {
    return this.requestExport.execute(parseInput(AssociationParams, params).aid, parseInput(CreateExportInput, body));
  }

  @Get(':id')
  @Endpoint('rp.export', 'get')
  @Can('reports.export')
  get(@Param() params: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.getExport.execute(aid, id);
  }
}
