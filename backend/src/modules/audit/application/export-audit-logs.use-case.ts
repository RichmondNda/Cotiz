import { Injectable } from '@nestjs/common';
import { csvDocument } from '../../reporting/reporting.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { type AuditFilterInput, platformAuditLogs } from './platform-audit-logs.js';

/** Entrées au plus par export : au-delà, `truncated` (resserrer la période). */
export const AUDIT_EXPORT_MAX_ROWS = 10_000;

const TIME = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'medium',
  timeZone: 'Africa/Abidjan',
});

/**
 * pf.audit › export (lot 4.7) : mêmes filtres que la liste, CSV des 10 000 entrées les plus récentes (« ; », BOM,
 * formules neutralisées, comme les exports du lot 4.6). Audité (`audit_log.export` : filtres et nombre de lignes, rien
 * du contenu exporté).
 */
@Injectable()
export class ExportAuditLogsUseCase {
  @Audited('audit_log.export')
  async execute(filters: AuditFilterInput): Promise<{ csv: Buffer; truncated: boolean }> {
    const { entries } = await platformAuditLogs(filters, { after: null, limit: AUDIT_EXPORT_MAX_ROWS + 1 });
    const rows = entries.slice(0, AUDIT_EXPORT_MAX_ROWS);
    const csv = csvDocument([
      ['Date', 'Acteur', 'Rôle', 'Association', 'Action', 'Entité', 'Identifiant', 'Adresse IP'],
      ...rows.map((e) => [
        TIME.format(new Date(e.occurredAt)),
        e.actor ? `${e.actor.firstName} ${e.actor.lastName}`.trim() : '',
        e.actorRole,
        e.associationId,
        e.action,
        e.entityType,
        e.entityId,
        e.ip,
      ]),
    ]);
    recordAudit({
      entityType: 'audit_log',
      entityId: null,
      associationId: null,
      after: { filters, rows: rows.length },
    });
    return { csv, truncated: entries.length > AUDIT_EXPORT_MAX_ROWS };
  }
}
