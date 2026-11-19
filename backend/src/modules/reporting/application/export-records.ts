import type { ExportJob } from '@cotiz/contracts';
import { exportJobs } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type ExportRecord = typeof exportJobs.$inferSelect;

/** Paramètres d'un export gardés dans `export_jobs.params` (rp.export › create, sans le type). */
export const ExportParams = z.object({
  projectId: z.uuid().optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});
export type ExportParams = z.infer<typeof ExportParams>;

export function toExportJob(row: ExportRecord): z.infer<typeof ExportJob> {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    fileId: row.status === 'done' ? row.fileId : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Export de cette association (RLS en plus du filtre) ; `lock` : verrou de ligne (`FOR UPDATE`). */
export async function exportOf(
  associationId: string,
  id: string,
  options: { lock?: boolean } = {},
): Promise<ExportRecord | null> {
  const query = currentTx()
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.id, id), eq(exportJobs.associationId, associationId)));
  const [row] = await (options.lock ? query.for('update') : query);
  return row ?? null;
}

/** Ce qu'une notification dit d'un export (`export.completed`) : type, demandeur, projet visé. */
export async function exportNoticeOf(
  associationId: string,
  id: string,
): Promise<{ id: string; kind: ExportRecord['kind']; requestedBy: string; projectId: string | null } | null> {
  const job = await exportOf(associationId, id);
  if (job?.status !== 'done') return null;
  return {
    id: job.id,
    kind: job.kind,
    requestedBy: job.requestedBy,
    projectId: ExportParams.parse(job.params).projectId ?? null,
  };
}
