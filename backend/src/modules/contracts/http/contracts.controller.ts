import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import { AssociationParams, ENDPOINTS, ListQuery, ProjectParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { GetContractUseCase } from '../application/get-contract.use-case.js';
import { ListContractsUseCase } from '../application/list-contracts.use-case.js';
import { LockContractUseCase } from '../application/lock-contract.use-case.js';
import { UpdateContractUseCase } from '../application/update-contract.use-case.js';

const UpdateBody = ENDPOINTS['ct.get'].operations.update.request.body;

/**
 * Contrats d'une association (ct.get : lecture, modification, verrouillage ; ct.list), lot 4.1. `@Can` du contrat
 * (`association.read`) ; modification et verrouillage exigent en plus `projects.manage` dans le cas d'usage.
 */
@Controller('associations/:aid')
export class ContractsController {
  constructor(
    private readonly getContract: GetContractUseCase,
    private readonly updateContract: UpdateContractUseCase,
    private readonly lockContract: LockContractUseCase,
    private readonly listContracts: ListContractsUseCase,
  ) {}

  @Get('projects/:pid/contract')
  @Endpoint('ct.get', 'get')
  @Can('association.read')
  get(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.getContract.execute(aid, pid);
  }

  @Put('projects/:pid/contract')
  @Endpoint('ct.get', 'update')
  @Can('association.read')
  update(@Param() params: unknown, @Body() body: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.updateContract.execute(aid, pid, parseInput(UpdateBody, body));
  }

  @Post('projects/:pid/contract/lock')
  @Endpoint('ct.get', 'lock')
  @Can('association.read')
  @HttpCode(200)
  lock(@Param() params: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.lockContract.execute(aid, pid);
  }

  @Get('contracts')
  @Endpoint('ct.list', 'list')
  @Can('association.read')
  list(@Param() params: unknown, @Query() query: unknown) {
    return this.listContracts.execute(parseInput(AssociationParams, params).aid, parseInput(ListQuery, query));
  }
}
