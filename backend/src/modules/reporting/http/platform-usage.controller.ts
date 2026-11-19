import { Controller, Get, Param, Query } from '@nestjs/common';
import { ENDPOINTS, IdParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetUsageUseCase } from '../application/get-usage.use-case.js';

const UsageQuery = ENDPOINTS['pf.asso.usage'].operations.get.request.query;

/** pf.asso.usage (lot 4.6) : statistiques d'usage quotidiennes d'une association (connexion plateforme). */
@Controller('platform/associations/:id/usage')
export class PlatformUsageController {
  constructor(private readonly getUsage: GetUsageUseCase) {}

  @Get()
  @Endpoint('pf.asso.usage', 'get')
  @Can('platform.associations.read')
  get(@Param() params: unknown, @Query() query: unknown) {
    const { from, to } = parseInput(UsageQuery, query);
    return this.getUsage.execute(parseInput(IdParams, params).id, { ...(from ? { from } : {}), ...(to ? { to } : {}) });
  }
}
