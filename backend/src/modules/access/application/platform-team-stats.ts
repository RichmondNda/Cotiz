import { memberships } from '@cotiz/db';
import { and, countDistinct, eq, ne, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export interface TeamSize {
  /** Souscripteurs non retirés (quota `subscribers`). */
  subscribers: number;
  /** Gestionnaires (owner, manager, viewer) non retirés, invités compris (quota `managers`, comme la fiche). */
  managers: number;
  /** Gestionnaires actifs : leurs connexions font l'activité de l'association. */
  activeManagerIds: string[];
}

function assertPlatform(what: string): void {
  if (currentContext()?.space !== 'platform') throw new Error(`${what} : espace plateforme seulement`);
}

/**
 * Taille de l'équipe de chaque association ayant au moins une appartenance (tableau de bord plateforme) : comptée en
 * base, sans charger les souscripteurs. Plateforme seulement.
 */
export async function platformTeamSizes(): Promise<Map<string, TeamSize>> {
  assertPlatform('platformTeamSizes');
  const tx = currentTx();
  const counts = await tx
    .select({
      associationId: memberships.associationId,
      subscribers: sql<number>`count(*) FILTER (WHERE ${memberships.role} = 'subscriber')`.mapWith(Number),
      managers: sql<number>`count(*) FILTER (WHERE ${memberships.role} <> 'subscriber')`.mapWith(Number),
    })
    .from(memberships)
    .where(ne(memberships.status, 'removed'))
    .groupBy(memberships.associationId);
  const active = await tx
    .select({ associationId: memberships.associationId, userId: memberships.userId })
    .from(memberships)
    .where(and(ne(memberships.role, 'subscriber'), eq(memberships.status, 'active')));
  const sizes = new Map<string, TeamSize>(
    counts.map((c) => [c.associationId, { subscribers: c.subscribers, managers: c.managers, activeManagerIds: [] }]),
  );
  for (const { associationId, userId } of active) sizes.get(associationId)?.activeManagerIds.push(userId);
  return sizes;
}

/** Souscripteurs de la plateforme : personnes distinctes inscrites dans au moins une association (non retirées). */
export async function platformSubscribersCount(): Promise<number> {
  assertPlatform('platformSubscribersCount');
  const [row] = await currentTx()
    .select({ n: countDistinct(memberships.userId) })
    .from(memberships)
    .where(and(eq(memberships.role, 'subscriber'), ne(memberships.status, 'removed')));
  return row?.n ?? 0;
}
