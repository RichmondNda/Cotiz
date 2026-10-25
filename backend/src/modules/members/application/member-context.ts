import { currentContext } from '../../../shared/tenant-context/index.js';

/** L'association du contexte (identifiant de l'URL en minuscules, comme MembershipGuard), sinon erreur. */
export function contextAssociationId(aid: string): string {
  const context = currentContext();
  const id = aid.toLowerCase();
  if (context?.space !== 'association' || context.associationId !== id) {
    throw new Error('contexte de cette association attendu');
  }
  return id;
}
