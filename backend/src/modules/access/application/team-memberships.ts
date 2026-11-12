import { memberships } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { and, asc, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { asInvitedMember } from '../../../shared/tenant-context/self.js';
import { MANAGEMENT_ROLES, type ManagementRole } from './memberships.js';

// Équipe d'une association (tm.team, lot 4.5) : appartenances owner, manager, viewer. Une seule ligne de gestion par
// personne et association (garantie par ces fonctions : on change le rôle de la ligne, on n'en ajoute pas).

export interface TeamRow {
  userId: string;
  role: ManagementRole;
  title: string | null;
  status: 'invited' | 'active';
  createdAt: Date;
}

export interface TeamMembership {
  role: ManagementRole;
  status: 'invited' | 'active' | 'removed';
  title: string | null;
  createdAt: Date;
}

function assertAssociation(associationId: string, what: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de cette association attendu`);
  }
}

const managed = inArray(memberships.role, [...MANAGEMENT_ROLES]);
const rank = (role: ManagementRole) => MANAGEMENT_ROLES.indexOf(role);

/**
 * Verrou de l'équipe (transaction) : invitation, changement de rôle et retrait se suivent, ce qui protège le dernier
 * owner (deux retraits simultanés de deux owners ne passent pas tous deux le comptage).
 */
export async function lockTeam(associationId: string): Promise<void> {
  assertAssociation(associationId, 'lockTeam');
  await currentTx().execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`team:${associationId}`}, 0))`);
}

/** Gestionnaires invités ou actifs de l'association : owner d'abord, puis par ancienneté. */
export async function teamOf(associationId: string): Promise<TeamRow[]> {
  assertAssociation(associationId, 'teamOf');
  const rows = await currentTx()
    .select({
      userId: memberships.userId,
      role: memberships.role,
      title: memberships.title,
      status: memberships.status,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), managed, ne(memberships.status, 'removed')))
    .orderBy(asc(memberships.createdAt), asc(memberships.id));
  // Une personne avec deux lignes (données anciennes) : son rôle le plus fort.
  const byUser = new Map<string, TeamRow>();
  for (const row of rows) {
    const role = row.role as ManagementRole;
    const seen = byUser.get(row.userId);
    if (seen && rank(seen.role) <= rank(role)) continue;
    byUser.set(row.userId, { ...row, role, status: row.status as TeamRow['status'] });
  }
  return [...byUser.values()].sort(
    (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner') || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/**
 * Appartenance de gestion de la personne dans l'association (verrouillée), retirée comprise ; `null` si elle n'en a
 * jamais eu. Non retirée d'abord, puis la plus forte.
 */
export async function teamMembershipOf(associationId: string, userId: string): Promise<TeamMembership | null> {
  assertAssociation(associationId, 'teamMembershipOf');
  const rows = await currentTx()
    .select({
      role: memberships.role,
      status: memberships.status,
      title: memberships.title,
      createdAt: memberships.createdAt,
    })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), eq(memberships.userId, userId), managed))
    .for('update');
  const sorted = rows
    .map((r) => ({ ...r, role: r.role as ManagementRole }))
    .sort((a, b) => Number(a.status === 'removed') - Number(b.status === 'removed') || rank(a.role) - rank(b.role));
  return sorted[0] ?? null;
}

/** Owners actifs de l'association (protection du dernier owner, `last_owner`). */
export async function activeOwnersCountOf(associationId: string): Promise<number> {
  assertAssociation(associationId, 'activeOwnersCountOf');
  const [row] = await currentTx()
    .select({ n: count() })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.role, 'owner'),
        eq(memberships.status, 'active'),
      ),
    );
  return row?.n ?? 0;
}

/**
 * Invitation dans l'équipe : appartenance `invited` créée, ou rétablie si la personne avait été retirée, ou rôle mis à
 * jour si elle était encore invitée (réinvitation). L'appelant a vérifié qu'elle n'est pas déjà active, et le quota.
 */
export async function inviteToTeam(
  associationId: string,
  userId: string,
  role: ManagementRole,
  invitedBy: string,
): Promise<void> {
  assertAssociation(associationId, 'inviteToTeam');
  const tx = currentTx();
  const existing = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.associationId, associationId), eq(memberships.userId, userId), managed))
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .for('update');
  const [kept, ...extra] = existing;
  if (!kept) {
    await tx.insert(memberships).values({ id: newId(), associationId, userId, role, status: 'invited', invitedBy });
    return;
  }
  await retire(extra.map((r) => r.id));
  await tx
    .update(memberships)
    .set({ role, status: 'invited', invitedBy, removedAt: null, joinedAt: null })
    .where(eq(memberships.id, kept.id));
}

/** Nouveau rôle de la personne (appartenance non retirée) ; `false` si elle n'est pas dans l'équipe. */
export async function changeTeamRole(associationId: string, userId: string, role: ManagementRole): Promise<boolean> {
  assertAssociation(associationId, 'changeTeamRole');
  const tx = currentTx();
  const rows = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.userId, userId),
        managed,
        ne(memberships.status, 'removed'),
      ),
    )
    .orderBy(asc(memberships.createdAt), asc(memberships.id))
    .for('update');
  const [kept, ...extra] = rows;
  if (!kept) return false;
  await retire(extra.map((r) => r.id));
  await tx.update(memberships).set({ role }).where(eq(memberships.id, kept.id));
  return true;
}

/** Lignes de gestion en trop d'une personne (données anciennes) : retirées, une seule ligne reste. */
async function retire(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await currentTx()
    .update(memberships)
    .set({ status: 'removed', removedAt: sql`now()` })
    .where(inArray(memberships.id, ids));
}

/** Retrait de l'équipe (toutes ses lignes de gestion) ; `false` si la personne n'y était pas. */
export async function removeFromTeam(associationId: string, userId: string): Promise<boolean> {
  assertAssociation(associationId, 'removeFromTeam');
  const removed = await currentTx()
    .update(memberships)
    .set({ status: 'removed', removedAt: sql`now()` })
    .where(
      and(
        eq(memberships.associationId, associationId),
        eq(memberships.userId, userId),
        managed,
        ne(memberships.status, 'removed'),
      ),
    )
    .returning({ id: memberships.id });
  return removed.length > 0;
}

/**
 * Acceptation d'une invitation (auth.activate avec un code `team_invite`, espace auth) : l'appartenance invitée de la
 * personne dans l'association du code passe `active` (`joined_at`, décision 25). `associationId` vient du code vérifié.
 * `false` si elle n'est plus invitée (retirée entre-temps) : le code ne vaut plus rien.
 */
export function acceptTeamInvitation(associationId: string, userId: string): Promise<boolean> {
  return asInvitedMember(associationId, userId, async () => {
    const accepted = await currentTx()
      .update(memberships)
      .set({ status: 'active', joinedAt: sql`now()` })
      .where(
        and(
          eq(memberships.associationId, associationId),
          eq(memberships.userId, userId),
          managed,
          eq(memberships.status, 'invited'),
        ),
      )
      .returning({ id: memberships.id });
    return accepted.length > 0;
  });
}
