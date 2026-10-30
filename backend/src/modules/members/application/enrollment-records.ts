import { enrollments, subscriberProfiles } from '@cotiz/db';
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

/**
 * Association qui a créé le compte de la personne (subscriber_profiles, table globale) ; `null` s'il a été créé
 * ailleurs (plateforme, compte gestionnaire) ou avant le lot 2.3. Seule cette association remet un code d'activation.
 */
export async function profileCreatorOf(userId: string): Promise<string | null> {
  const [row] = await currentTx()
    .select({ associationId: subscriberProfiles.createdByAssociationId })
    .from(subscriberProfiles)
    .where(eq(subscriberProfiles.userId, userId))
    .limit(1);
  return row?.associationId ?? null;
}
