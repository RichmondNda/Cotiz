import { type IsoDate, todayIn } from '@cotiz/domain';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
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

/** Aujourd'hui dans le fuseau de l'association (domain-rules § 6). */
export async function associationToday(aid: string): Promise<IsoDate> {
  const association = await ownAssociationOf(aid);
  if (!association) throw new DomainProblem('not_found');
  return todayIn(association.timezone);
}
