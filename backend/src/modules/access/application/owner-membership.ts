import { associations, memberships } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

function assertPlatform(what: string): void {
  if (currentContext()?.space !== 'platform') throw new Error(`${what} : espace plateforme seulement`);
}

/**
 * La personne est-elle déjà owner (active ou invitée) d'une association ? Une adresse ne gère qu'une association
 * (`email_already_owner`, approbation et création directe). Espace plateforme seulement : lit toutes les associations.
 */
export async function ownsAnAssociation(userId: string): Promise<boolean> {
  assertPlatform('ownsAnAssociation');
  const [row] = await currentTx()
    .select({ one: sql<number>`1` })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.role, 'owner'),
        inArray(memberships.status, ['active', 'invited']),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Gestionnaire principal d'une nouvelle association : appartenance owner active (lot 1.3). Espace plateforme seulement. */
export async function grantOwnership(associationId: string, userId: string, invitedBy: string): Promise<void> {
  assertPlatform('grantOwnership');
  await currentTx()
    .insert(memberships)
    .values({
      id: newId(),
      associationId,
      userId,
      role: 'owner',
      status: 'active',
      invitedBy,
      joinedAt: sql`now()`,
    });
}

/** Owner de l'association (rejeu d'une approbation) ; `null` si elle n'en a pas. Espace plateforme seulement. */
export async function ownerOf(associationId: string): Promise<string | null> {
  assertPlatform('ownerOf');
  const [row] = await currentTx()
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), eq(memberships.role, 'owner')))
    .orderBy(memberships.createdAt)
    .limit(1);
  return row?.userId ?? null;
}

export interface AssociationMembers {
  /** Gestionnaires (owner, manager, viewer) invités ou actifs, owner en premier, puis par ancienneté. */
  managers: { userId: string; role: 'owner' | 'manager' | 'viewer' }[];
  /** Souscripteurs non retirés. */
  subscribers: number;
}

/** Équipe et nombre de souscripteurs d'une association (fiche plateforme). Espace plateforme seulement. */
export async function membersOf(associationId: string): Promise<AssociationMembers> {
  assertPlatform('membersOf');
  const rows = await currentTx()
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), ne(memberships.status, 'removed')))
    .orderBy(sql`${memberships.role} <> 'owner'`, memberships.createdAt, memberships.id);
  const managers = rows.flatMap((r) => (r.role === 'subscriber' ? [] : [{ userId: r.userId, role: r.role }]));
  return { managers, subscribers: rows.length - managers.length };
}

export interface AssociationTeam {
  /** Souscripteurs non retirés. */
  subscribers: number;
  /** Gestionnaires (owner, manager, viewer) actifs : leurs connexions font l'activité de l'association. */
  activeManagerIds: string[];
}

/** Équipe de chaque association donnée (liste plateforme), par identifiant. Espace plateforme seulement. */
export async function teamsOf(associationIds: readonly string[]): Promise<Map<string, AssociationTeam>> {
  assertPlatform('teamsOf');
  const teams = new Map<string, AssociationTeam>(
    associationIds.map((id) => [id, { subscribers: 0, activeManagerIds: [] }]),
  );
  if (teams.size === 0) return teams;
  const rows = await currentTx()
    .select({
      associationId: memberships.associationId,
      userId: memberships.userId,
      role: memberships.role,
      status: memberships.status,
    })
    .from(memberships)
    .where(and(inArray(memberships.associationId, [...teams.keys()]), ne(memberships.status, 'removed')));
  for (const row of rows) {
    const team = teams.get(row.associationId);
    if (!team) continue;
    if (row.role === 'subscriber') team.subscribers += 1;
    else if (row.status === 'active') team.activeManagerIds.push(row.userId);
  }
  return teams;
}

/**
 * Statut de l'association du contexte et ses gestionnaires (owner, manager, viewer) actifs (consommateur de
 * association.suspended). Contexte de cette association seulement : jamais l'équipe d'une autre.
 */
export async function suspensionTeamOf(
  associationId: string,
): Promise<{ status: string; activeManagerIds: string[] } | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('suspensionTeamOf : contexte de cette association seulement');
  }
  const tx = currentTx();
  const [association] = await tx
    .select({ status: associations.status })
    .from(associations)
    .where(eq(associations.id, associationId));
  if (!association) return null;
  const rows = await tx
    .selectDistinct({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.status, 'active'),
        ne(memberships.role, 'subscriber'),
      ),
    );
  return { status: association.status, activeManagerIds: rows.map((r) => r.userId) };
}
