import { associations } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export type AssociationRecord = typeof associations.$inferSelect;

/** Une association, lue par la plateforme (fiche d'une association) ; `null` si elle n'existe pas. */
export async function platformAssociationOf(id: string): Promise<AssociationRecord | null> {
  if (currentContext()?.space !== 'platform') throw new Error('platformAssociationOf : espace plateforme seulement');
  const [row] = await currentTx().select().from(associations).where(eq(associations.id, id));
  return row ?? null;
}

export type AssociationOverview = Pick<
  AssociationRecord,
  'id' | 'name' | 'status' | 'createdAt' | 'onboardingCompletedAt'
>;

/** Toutes les associations, réduites à ce que le tableau de bord plateforme surveille. Plateforme seulement. */
export async function platformAssociationsOverview(): Promise<AssociationOverview[]> {
  if (currentContext()?.space !== 'platform') {
    throw new Error('platformAssociationsOverview : espace plateforme seulement');
  }
  return currentTx()
    .select({
      id: associations.id,
      name: associations.name,
      status: associations.status,
      createdAt: associations.createdAt,
      onboardingCompletedAt: associations.onboardingCompletedAt,
    })
    .from(associations);
}
