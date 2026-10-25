import { enrollments } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

export type EnrollmentRecord = typeof enrollments.$inferSelect;

/** Inscription de la personne au projet (une au plus, quel que soit son statut), sous la RLS du contexte ; `null` sinon. */
export async function enrollmentOf(projectId: string, userId: string): Promise<EnrollmentRecord | null> {
  const [row] = await currentTx()
    .select()
    .from(enrollments)
    .where(and(eq(enrollments.projectId, projectId), eq(enrollments.userId, userId)))
    .limit(1);
  return row ?? null;
}
