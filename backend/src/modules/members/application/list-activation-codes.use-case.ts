import { Injectable } from '@nestjs/common';
import type { ActivationCodeList, ActivationCodesQuery } from '@cotiz/contracts';
import type { z } from 'zod';
import { SubscriberActivationCodes } from '../../identity/identity.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { contextAssociationId } from './member-context.js';

/**
 * mb.codes (list) : « Codes à remettre » (Q6), comptes non activés et dernier code émis par l'association, les plus
 * récents d'abord, pages par curseur. Lecture de codes en clair : auditée (sans code).
 */
@Injectable()
export class ListActivationCodesUseCase {
  constructor(private readonly codes: SubscriberActivationCodes) {}

  @Audited('activation_code.list')
  async execute(aid: string, query: z.infer<typeof ActivationCodesQuery>): Promise<z.infer<typeof ActivationCodeList>> {
    contextAssociationId(aid);
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const after = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !after) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const page = await this.codes.page({ handed: query.handed, after, limit: query.limit });
    recordAudit({
      entityType: 'activation_code',
      entityId: null,
      after: { handed: query.handed ?? null, listed: page.entries.map((entry) => entry.id) },
    });
    return {
      items: page.entries,
      nextCursor: page.next ? encodeCursor(page.next) : null,
      total: page.total,
    };
  }
}
