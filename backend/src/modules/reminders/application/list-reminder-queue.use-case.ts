import { Injectable } from '@nestjs/common';
import type { ListQuery, ReminderQueueEntry } from '@cotiz/contracts';
import type { z } from 'zod';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { decodeCursor, encodeCursor } from '../../../shared/pagination/index.js';
import { queueItemsOf, toQueueEntries } from './queue-entries.js';

type Query = ListQuery & { status?: z.infer<typeof ReminderQueueEntry>['status']; projectId?: string };

/**
 * rm.queue › list : file « À relancer » (lot 4.3) — chaque échéance en retard, avec le message prêt (copier,
 * WhatsApp, `sms:`) ; filtre de statut (`to_handle` : les retards sans relance du jour) et de projet. Pages par curseur
 * (échéance, id). Fonctionnalité `auto_reminders` du plan (features.yaml : « file À relancer »).
 */
@Injectable()
export class ListReminderQueueUseCase {
  async execute(
    aid: string,
    query: Query,
  ): Promise<{ items: z.infer<typeof ReminderQueueEntry>[]; nextCursor: string | null; total: number }> {
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'auto_reminders');
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
    if (query.cursor !== undefined && !cursor) {
      throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
    }
    const today = await associationToday(associationId);
    const entries = (
      await toQueueEntries(
        associationId,
        await queueItemsOf(associationId, query.projectId ? { projectId: query.projectId } : {}),
        today,
      )
    ).filter((e) => !query.status || e.status === query.status);
    // Curseur (échéance, id) au format commun des listes : la date de l'échéance à minuit UTC.
    const day = cursor?.at.slice(0, 10);
    const after =
      cursor && day
        ? entries.filter((e) => e.dueDate > day || (e.dueDate === day && e.installmentId > cursor.id))
        : entries;
    const page = after.slice(0, query.limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor:
        after.length > query.limit && last
          ? encodeCursor({ at: `${last.dueDate} 00:00:00+00`, id: last.installmentId })
          : null,
      total: entries.length,
    };
  }
}
