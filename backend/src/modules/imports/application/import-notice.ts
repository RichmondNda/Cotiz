import { importJobs } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** Faits d'un import utiles à sa notification (module notifications) : projet et auteur. Null hors de l'association. */
export async function importNoticeOf(
  associationId: string,
  importId: string,
): Promise<{ projectId: string; createdBy: string } | null> {
  const [row] = await currentTx()
    .select({ projectId: importJobs.projectId, createdBy: importJobs.createdBy })
    .from(importJobs)
    .where(and(eq(importJobs.associationId, associationId), eq(importJobs.id, importId)));
  return row ?? null;
}
