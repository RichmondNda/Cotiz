import { Injectable } from '@nestjs/common';
import type { ReminderQueueEntry } from '@cotiz/contracts';
import { reminderRuns } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { assertPlanFeature } from '../../billing/billing.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { queueItemsOf, toQueueEntries } from './queue-entries.js';

/**
 * rm.queue › handled : entrée de la file marquée relancée (`handled`) ou ignorée (`dismissed`) par le gestionnaire,
 * après avoir transmis le message lui-même. L'entrée cite sa relance encore à traiter (mise à jour), ou l'échéance
 * jamais relancée (une relance manuelle est créée, déjà marquée). Échéance soldée, dispensée ou d'une autre
 * association : 404. Re-marquer le même jour remplace le marquage. `reminder.handled` (reporting).
 */
@Injectable()
export class MarkReminderUseCase {
  constructor(private readonly outbox: OutboxService) {}

  async execute(
    aid: string,
    id: string,
    outcome: 'handled' | 'dismissed',
  ): Promise<z.infer<typeof ReminderQueueEntry>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    await assertPlanFeature(associationId, 'auto_reminders');
    const today = await associationToday(associationId);
    const items = await queueItemsOf(associationId);
    const entries = await toQueueEntries(associationId, items, today);
    const entry = entries.find((e) => e.id === id);
    const item = entry ? items.find((i) => i.installment.id === entry.installmentId) : undefined;
    if (!entry || !item) throw new DomainProblem('not_found');

    const tx = currentTx();
    const marked = { status: outcome, handledBy: actor.userId, handledAt: new Date() } as const;
    let runId: string;
    if (entry.id === item.run?.id) {
      const [updated] = await tx
        .update(reminderRuns)
        .set(marked)
        .where(and(eq(reminderRuns.associationId, associationId), eq(reminderRuns.id, entry.id)))
        .returning({ id: reminderRuns.id });
      if (!updated) throw new DomainProblem('not_found');
      runId = updated.id;
    } else {
      const [created] = await tx
        .insert(reminderRuns)
        .values({
          associationId,
          ruleId: null,
          installmentId: item.installment.id,
          userId: item.installment.userId,
          kind: 'manual',
          triggeredBy: actor.userId,
          channels: [],
          message: entry.message,
          runDate: today,
          ...marked,
        })
        .returning({ id: reminderRuns.id });
      if (!created) throw new Error('relance non créée');
      runId = created.id;
    }
    await this.outbox.publish(tx, {
      type: 'reminder.handled',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'reminder', id: runId },
      payload: { runId, status: outcome, handledBy: actor.userId },
    });
    return { ...entry, id: runId, status: outcome, kind: entry.id === item.run?.id ? entry.kind : 'manual' };
  }
}
