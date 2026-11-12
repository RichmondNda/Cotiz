import { Injectable } from '@nestjs/common';
import type { ReminderQueueEntry, SendReminderInput } from '@cotiz/contracts';
import type { z } from 'zod';
import { remindableInstallmentsOf, type RemindableInstallment } from '../../ledger/ledger.public.js';
import { associationToday, contextAssociationId } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { Audited, recordAudit } from '../../../shared/audit/index.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { unknownVariables } from '../domain/reminder-rule.js';
import { createReminderRuns } from './reminder-runs.js';
import { toQueueEntries } from './queue-entries.js';

/**
 * rm.send : relance manuelle ciblée (lot 4.3) — tous les retardataires d'un projet, ou les personnes choisies (leurs
 * échéances en retard ; sans retard, leur prochaine échéance due). Chaque échéance : rappel in-app/push au souscripteur
 * (`reminder.sent`) et relance `to_handle` avec le message prêt, renvoyée pour être transmise tout de suite. Message du
 * gestionnaire (variables `{{…}}` des règles) ou message par défaut. Personne ni échéance d'une autre association :
 * ignorées (rien n'en sort). Audité (`reminder.send`) ; Idempotency-Key et débit : drapeaux du contrat.
 */
@Injectable()
export class SendRemindersUseCase {
  constructor(private readonly outbox: OutboxService) {}

  @Audited('reminder.send')
  async execute(
    aid: string,
    input: z.infer<typeof SendReminderInput>,
  ): Promise<{ queued: z.infer<typeof ReminderQueueEntry>[] }> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    if (input.message !== undefined) {
      if (input.message.trim() === '')
        throw new DomainProblem('validation_failed', { fields: { message: 'required' } });
      if (unknownVariables(input.message).length > 0) {
        throw new DomainProblem('validation_failed', { fields: { message: 'unknown_variable' } });
      }
    }
    if (input.projectId && !(await projectOf(associationId, input.projectId))) throw new DomainProblem('not_found');
    const installments =
      'allLate' in input
        ? await remindableInstallmentsOf(associationId, { projectId: input.projectId, lateOnly: true })
        : await this.targetsOf(associationId, input.userIds, input.projectId ?? null);
    const today = await associationToday(associationId);
    const runs = await createReminderRuns(this.outbox, {
      associationId,
      today,
      source: { kind: 'manual', triggeredBy: actor.userId, message: input.message ?? null },
      installments,
    });
    const byInstallment = new Map(installments.map((i) => [i.id, i]));
    const queued = await toQueueEntries(
      associationId,
      runs.flatMap((run) => {
        const installment = byInstallment.get(run.installmentId);
        return installment ? [{ installment, run }] : [];
      }),
      today,
    );
    recordAudit({
      entityType: 'reminder',
      entityId: null,
      after: {
        projectId: input.projectId ?? null,
        allLate: 'allLate' in input,
        runs: runs.length,
        userIds: [...new Set(runs.map((r) => r.userId))],
      },
    });
    return { queued };
  }

  /** Échéances en retard des personnes choisies ; sans retard, leur prochaine échéance due (une par personne et projet). */
  private async targetsOf(
    associationId: string,
    userIds: readonly string[],
    projectId: string | null,
  ): Promise<RemindableInstallment[]> {
    const open = await remindableInstallmentsOf(associationId, { userIds, projectId });
    const late = open.filter((i) => i.late);
    const withLate = new Set(late.map((i) => `${i.userId}:${i.projectId}`));
    const next = new Map<string, RemindableInstallment>();
    for (const i of open) {
      const key = `${i.userId}:${i.projectId}`;
      if (!withLate.has(key) && !next.has(key)) next.set(key, i);
    }
    return [...late, ...next.values()];
  }
}
