import { type AssociationAction, associationTransition, DomainError } from '@cotiz/domain';
import { associations, updateWithVersion } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import type { AssociationRecord } from './association-records.js';

/**
 * Changement de statut d'une association par la plateforme (pf.asso.suspend), sous verrou de la ligne : la transition
 * vient de @cotiz/domain (interdite : 409 `invalid_state`), la version s'incrémente. Suspension : date et motif ;
 * réactivation : effacés. Association inconnue : 404. Renvoie la ligne avant et après.
 */
export async function changeAssociationStatus(
  id: string,
  action: AssociationAction,
  check: (current: AssociationRecord) => void,
  reason: string | null = null,
): Promise<{ before: AssociationRecord; after: AssociationRecord }> {
  if (currentContext()?.space !== 'platform') throw new Error('changeAssociationStatus : espace plateforme seulement');
  const tx = currentTx();
  const [before] = await tx.select().from(associations).where(eq(associations.id, id)).for('update');
  if (!before) throw new DomainProblem('not_found');
  check(before);
  let status;
  try {
    status = associationTransition(before.status, action);
  } catch (error) {
    if (error instanceof DomainError && error.code === 'invalid_state') {
      throw new DomainProblem('invalid_state');
    }
    throw error;
  }
  const suspended = status === 'suspended';
  const after = await updateWithVersion(
    tx,
    associations,
    { id, version: before.version },
    { status, suspendedAt: suspended ? new Date() : null, suspensionReason: suspended ? reason : null },
  );
  if (!after) throw new DomainProblem('not_found');
  return { before, after };
}
