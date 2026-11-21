import { Injectable } from '@nestjs/common';
import type { ENDPOINTS } from '@cotiz/contracts';
import type { z } from 'zod';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeSerialCursor, encodeSerialCursor } from '../../../shared/pagination/index.js';
import { type AuditEntryView, platformAuditLogs } from './platform-audit-logs.js';

type ListInput = z.infer<(typeof ENDPOINTS)['pf.audit']['operations']['list']['request']['query']>;

/** pf.audit › list (lot 4.7) : journal filtré, le plus récent d'abord ; tri unique (`sort` refusé). */
@Injectable()
export class ListAuditLogsUseCase {
  async execute(query: ListInput): Promise<{ items: AuditEntryView[]; nextCursor: string | null; total: number }> {
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const after = query.cursor === undefined ? null : decodeSerialCursor(query.cursor);
    if (query.cursor !== undefined && !after) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const { limit, cursor: _cursor, sort: _sort, ...filters } = query;
    const { entries, total } = await platformAuditLogs(filters, { after, limit: limit + 1 });
    const page = entries.slice(0, limit);
    const last = page.at(-1);
    return {
      items: page.map(({ at: _at, ...entry }) => entry),
      nextCursor: entries.length > limit && last ? encodeSerialCursor({ at: last.at, id: last.id }) : null,
      total,
    };
  }
}
