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
