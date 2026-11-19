import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { AssociationIdParams, ENDPOINTS, ProjectParams } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CommitImportUseCase } from '../application/commit-import.use-case.js';
import { CreateImportUseCase } from '../application/create-import.use-case.js';
import { ReadImportUseCase } from '../application/read-import.use-case.js';
import { UpdateImportMappingUseCase } from '../application/update-import-mapping.use-case.js';
import { UpdateImportRowUseCase } from '../application/update-import-row.use-case.js';

const CreateBody = ENDPOINTS['im.flow'].operations.create.request.body;
const MappingBody = ENDPOINTS['im.steps'].operations.mapping.request.body;
const RowParams = ENDPOINTS['im.steps'].operations.row.request.params;
const RowBody = ENDPOINTS['im.steps'].operations.row.request.body;
const RowsQuery = ENDPOINTS['im.read'].operations.rows.request.query;

/** Imports en masse de souscripteurs (im.flow, im.steps, im.read, im.commit ; lot 4.4), `members.manage`. */
@Controller('associations/:aid')
export class ImportsController {
  constructor(
    private readonly createImport: CreateImportUseCase,
    private readonly readImport: ReadImportUseCase,
    private readonly updateMapping: UpdateImportMappingUseCase,
    private readonly updateRow: UpdateImportRowUseCase,
    private readonly commitImport: CommitImportUseCase,
  ) {}

  @Post('projects/:pid/imports')
  @Endpoint('im.flow', 'create')
  @Can('members.manage')
  create(@Param() params: unknown, @Body() body: unknown) {
    const { aid, pid } = parseInput(ProjectParams, params);
    return this.createImport.execute(aid, pid, parseInput(CreateBody, body));
  }

  @Patch('imports/:id/mapping')
  @Endpoint('im.steps', 'mapping')
  @Can('members.manage')
  mapping(@Param() params: unknown, @Body() body: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.updateMapping.execute(aid, id, parseInput(MappingBody, body));
  }

  @Patch('imports/:id/rows/:rowId')
  @Endpoint('im.steps', 'row')
  @Can('members.manage')
  row(@Param() params: unknown, @Body() body: unknown) {
    const { aid, id, rowId } = parseInput(RowParams, params);
    return this.updateRow.execute(aid, id, rowId, parseInput(RowBody, body));
  }

  @Get('imports/:id')
  @Endpoint('im.read', 'get')
  @Can('members.manage')
  get(@Param() params: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.readImport.get(aid, id);
  }

  @Get('imports/:id/rows')
  @Endpoint('im.read', 'rows')
  @Can('members.manage')
  rows(@Param() params: unknown, @Query() query: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.readImport.rows(aid, id, parseInput(RowsQuery, query));
  }

  @Post('imports/:id/commit')
  @Endpoint('im.commit', 'commit')
  @Can('members.manage')
  @HttpCode(202)
  commit(@Param() params: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.commitImport.execute(aid, id);
  }
}
