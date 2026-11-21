import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import { AuditFilters, ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ExportAuditLogsUseCase } from '../application/export-audit-logs.use-case.js';
import { ListAuditLogsUseCase } from '../application/list-audit-logs.use-case.js';

const AUDIT = ENDPOINTS['pf.audit'].operations;

/** Journal d'audit de la plateforme (pf.audit, lot 4.7), `platform.audit.read` (owner, admin). */
@Controller('platform/audit-logs')
export class PlatformAuditController {
  constructor(
    private readonly listLogs: ListAuditLogsUseCase,
    private readonly exportLogs: ExportAuditLogsUseCase,
  ) {}

  @Get()
  @Endpoint('pf.audit', 'list')
  @Can('platform.audit.read')
  @Header('Cache-Control', 'no-store')
  list(@Query() query: unknown) {
    return this.listLogs.execute(parseInput(AUDIT.list.request.query, query));
  }

  @Get('export')
  @Endpoint('pf.audit', 'export')
  @Can('platform.audit.read')
  async export(
    @Query() query: unknown,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): unknown },
  ): Promise<StreamableFile> {
    const { csv, truncated } = await this.exportLogs.execute(parseInput(AuditFilters, query));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Truncated', String(truncated));
    return new StreamableFile(csv, {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="journal-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    });
  }
}
