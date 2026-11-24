import { Module } from '@nestjs/common';
import { ExportAuditLogsUseCase } from './application/export-audit-logs.use-case.js';
import { ListAuditLogsUseCase } from './application/list-audit-logs.use-case.js';
import { PlatformAuditController } from './http/platform-audit.controller.js';

/**
 * Module audit (pf.audit, lot 4.7) : lecture du journal d'audit de la plateforme (liste filtrée, export CSV). Sans
 * table propre : `audit_logs` est écrit par shared/audit (@Audited) ; noms des acteurs par identity.public.
 */
@Module({
  controllers: [PlatformAuditController],
  providers: [ListAuditLogsUseCase, ExportAuditLogsUseCase],
})
export class AuditModule {}
