import { reminderRuns } from '@cotiz/db';
import { type IsoDate, reminderRunStatus } from '@cotiz/domain';
import { associationSubscriberContactsOf } from '../../identity/identity.public.js';
import type { RemindableInstallment } from '../../ledger/ledger.public.js';
import { renderTemplate } from '../../../shared/templates/index.js';
import { projectsOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import type { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { DEFAULT_REMINDER_MESSAGE, reminderVars } from '../domain/reminder-message.js';

export type ReminderRunRow = typeof reminderRuns.$inferSelect;

/** Origine d'une série de relances : une règle (tâche quotidienne) ou un gestionnaire (rm.send). */
export type ReminderSource =
  | { kind: 'automatic'; ruleId: string; message: string; channels: readonly string[] }
  | { kind: 'manual'; triggeredBy: string; message: string | null };

/** Canaux automatiques d'une relance manuelle : la cloche et le push du souscripteur (architecture/04 § 4.9). */
const MANUAL_CHANNELS = ['in_app', 'push'] as const;

/**
 * Relances d'échéances (lot 4.3), dans le contexte de l'association : une ligne `reminder_runs` par échéance, message
 * rendu pour la personne (variables), statut `auto_sent` ou `to_handle` (reminderRunStatus). Une règle ne relance
 * qu'une fois par échéance et par jour (unique (rule_id, installment_id, run_date), ON CONFLICT DO NOTHING) : seules les
 * lignes nouvelles sont renvoyées et annoncées (`reminder.sent`, notification du souscripteur). Personne qui n'est plus
 * souscripteur active de l'association : rien.
 */
export async function createReminderRuns(
  outbox: OutboxService,
  input: {
    associationId: string;
    today: IsoDate;
    source: ReminderSource;
    installments: readonly RemindableInstallment[];
  },
): Promise<ReminderRunRow[]> {
  const { associationId, today, source } = input;
  if (input.installments.length === 0) return [];
  const association = await ownAssociationOf(associationId);
  if (!association) return [];
  const contacts = await associationSubscriberContactsOf(
    associationId,
    input.installments.map((i) => i.userId),
  );
  const projects = await projectsOf(associationId, [...new Set(input.installments.map((i) => i.projectId))]);
  const template = source.message ?? DEFAULT_REMINDER_MESSAGE;
  const channels = source.kind === 'automatic' ? [...source.channels] : [...MANUAL_CHANNELS];
  const values = input.installments.flatMap((i) => {
    const contact = contacts.get(i.userId);
    const project = projects.get(i.projectId);
    if (!contact || !project) return [];
    const vars = reminderVars({
      firstName: contact.firstName,
      lastName: contact.lastName,
      projectName: project.name,
      associationName: association.name,
      remaining: i.remaining,
      dueDate: i.dueDate,
      today,
    });
    // Variables contrôlées à l'écriture de la règle : un rendu impossible garde le message par défaut.
    const message = renderTemplate(template, vars) ?? renderTemplate(DEFAULT_REMINDER_MESSAGE, vars) ?? '';
    return [
      {
        associationId,
        ruleId: source.kind === 'automatic' ? source.ruleId : null,
        installmentId: i.id,
        userId: i.userId,
        kind: source.kind,
        triggeredBy: source.kind === 'manual' ? source.triggeredBy : null,
        status: reminderRunStatus(source.kind, i.late),
        channels,
        message,
        runDate: today,
      },
    ];
  });
  if (values.length === 0) return [];
  const created = await currentTx().insert(reminderRuns).values(values).onConflictDoNothing().returning();
  if (created.length === 0) return [];
  await outbox.publish(currentTx(), {
    type: 'reminder.sent',
    associationId,
    actorUserId: source.kind === 'manual' ? source.triggeredBy : null,
    aggregate: { type: 'reminder', id: created[0]?.id ?? associationId },
    payload: { runIds: created.map((r) => r.id), associationId },
  });
  return created;
}
