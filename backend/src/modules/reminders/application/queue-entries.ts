import type { ReminderQueueEntry } from '@cotiz/contracts';
import { reminderRuns } from '@cotiz/db';
import type { IsoDate } from '@cotiz/domain';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { associationSubscriberContactsOf } from '../../identity/identity.public.js';
import { type RemindableInstallment, remindableInstallmentsOf } from '../../ledger/ledger.public.js';
import { projectsOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { renderTemplate } from '../../../shared/templates/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { handoffLinks } from '../domain/handoff-links.js';
import { DEFAULT_REMINDER_MESSAGE, reminderVars } from '../domain/reminder-message.js';
import type { ReminderRunRow } from './reminder-runs.js';

export type QueueEntry = z.infer<typeof ReminderQueueEntry>;

/** Une échéance en retard de la file, avec sa dernière relance (s'il y en a une). */
export interface QueueItem {
  installment: RemindableInstallment;
  run: ReminderRunRow | null;
}

/**
 * File « À relancer » (lot 4.3), dans le contexte de l'association : chaque échéance en retard encore due
 * (remindableInstallmentsOf : inscription active, projet en cours, ni soldée, ni dispensée, ni annulée), avec sa
 * dernière relance. Statut de l'entrée : celui de cette relance si elle a été marquée (relancé, ignoré) aujourd'hui ;
 * sinon `to_handle` — un retard sans relance du jour est à traiter. Ordre : échéance la plus ancienne, puis id.
 */
export async function queueItemsOf(associationId: string, filter: { projectId?: string } = {}): Promise<QueueItem[]> {
  const late = await remindableInstallmentsOf(associationId, { lateOnly: true, projectId: filter.projectId ?? null });
  if (late.length === 0) return [];
  const runs = await currentTx()
    .select()
    .from(reminderRuns)
    .where(
      and(
        eq(reminderRuns.associationId, associationId),
        inArray(
          reminderRuns.installmentId,
          late.map((i) => i.id),
        ),
      ),
    )
    .orderBy(desc(reminderRuns.createdAt), desc(reminderRuns.id));
  const latest = new Map<string, ReminderRunRow>();
  for (const run of runs) if (!latest.has(run.installmentId)) latest.set(run.installmentId, run);
  return late.map((installment) => ({ installment, run: latest.get(installment.id) ?? null }));
}

/** Statut affiché d'une entrée de la file le jour `today`. */
export function entryStatus(item: QueueItem, today: IsoDate): QueueEntry['status'] {
  const run = item.run;
  if (run && (run.status === 'handled' || run.status === 'dismissed') && run.runDate === today) return run.status;
  return 'to_handle';
}

/**
 * Entrées de la file pour l'écran : message de la dernière relance encore à traiter, sinon message par défaut rendu
 * pour la personne ; id = celui de cette relance, ou celui de l'échéance si elle n'a jamais été relancée (le marquage
 * crée alors la relance, rm.queue › handled).
 */
export async function toQueueEntries(
  associationId: string,
  items: readonly QueueItem[],
  today: IsoDate,
): Promise<QueueEntry[]> {
  if (items.length === 0) return [];
  const association = await ownAssociationOf(associationId);
  const contacts = await associationSubscriberContactsOf(
    associationId,
    items.map((i) => i.installment.userId),
  );
  const projects = await projectsOf(associationId, [...new Set(items.map((i) => i.installment.projectId))]);
  return items.flatMap((item) => {
    const { installment } = item;
    const status = entryStatus(item, today);
    // Relance citée par l'entrée : encore à traiter, ou marquée aujourd'hui ; une relance traitée un autre jour reste
    // dans l'historique, le prochain marquage en crée une nouvelle.
    const run = item.run && (item.run.status === 'to_handle' || status !== 'to_handle') ? item.run : null;
    const member = contacts.get(installment.userId);
    const project = projects.get(installment.projectId);
    if (!member || !project || !association) return [];
    const message =
      run?.message ??
      renderTemplate(
        DEFAULT_REMINDER_MESSAGE,
        reminderVars({
          firstName: member.firstName,
          lastName: member.lastName,
          projectName: project.name,
          associationName: association.name,
          remaining: installment.remaining,
          dueDate: installment.dueDate,
          today,
        }),
      ) ??
      '';
    return [
      {
        id: run?.id ?? installment.id,
        member,
        project: { id: project.id, name: project.name },
        installmentId: installment.id,
        dueDate: installment.dueDate,
        amountDue: installment.remaining,
        lateSince: installment.lateSince,
        kind: run?.kind ?? 'automatic',
        status,
        message,
        ...handoffLinks(member.phone, message),
        createdAt: (
          run?.createdAt ?? new Date(`${installment.lateSince ?? installment.dueDate}T00:00:00Z`)
        ).toISOString(),
      },
    ];
  });
}
