import { reminderRuns } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { remindableInstallmentsOf } from '../../ledger/ledger.public.js';
import { projectsOf } from '../../projects/projects.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Ce que dit le rappel d'une relance au souscripteur (notification, lot 4.3), relu au moment de notifier. */
export interface ReminderNotice {
  runId: string;
  userId: string;
  projectId: string;
  projectName: string;
  dueDate: string;
  late: boolean;
  channels: string[];
  message: string;
}

/**
 * Relances annoncées par `reminder.sent`, dans le contexte de leur association (RLS) : seules celles dont l'échéance
 * est encore due (payée, dispensée ou inscription retirée entre-temps : aucun rappel).
 */
export async function reminderNoticesOf(associationId: string, runIds: readonly string[]): Promise<ReminderNotice[]> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('reminderNoticesOf : contexte de cette association seulement');
  }
  if (runIds.length === 0) return [];
  const runs = await currentTx()
    .select()
    .from(reminderRuns)
    .where(and(eq(reminderRuns.associationId, associationId), inArray(reminderRuns.id, [...new Set(runIds)])));
  const open = new Map(
    (await remindableInstallmentsOf(associationId, { installmentIds: runs.map((r) => r.installmentId) })).map((i) => [
      i.id,
      i,
    ]),
  );
  const projects = await projectsOf(associationId, [...new Set([...open.values()].map((i) => i.projectId))]);
  return runs.flatMap((run) => {
    const installment = open.get(run.installmentId);
    const project = installment ? projects.get(installment.projectId) : undefined;
    if (!installment || !project || installment.userId !== run.userId) return [];
    return [
      {
        runId: run.id,
        userId: run.userId,
        projectId: project.id,
        projectName: project.name,
        dueDate: installment.dueDate,
        late: installment.late,
        channels: run.channels,
        message: run.message ?? '',
      },
    ];
  });
}
