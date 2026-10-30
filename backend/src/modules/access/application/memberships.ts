import { associations, memberships } from '@cotiz/db';
import { and, asc, countDistinct, eq, inArray, ne, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { asSelf } from '../../../shared/tenant-context/self.js';

// Appartenances de la personne elle-même (architecture/02 ; lot 1.2). Toujours lues « de soi » (asSelf) : les
// politiques self_read et member_read ne s'appliquent que dans les espaces subscriber et auth.

export type MembershipRole = (typeof memberships.role.enumValues)[number];
export type MembershipStatus = (typeof memberships.status.enumValues)[number];
export type ManagementRole = Exclude<MembershipRole, 'subscriber'>;

/** Rôles de gestion, du plus fort au plus faible : une personne owner et manager d'une association est owner. */
export const MANAGEMENT_ROLES: readonly ManagementRole[] = ['owner', 'manager', 'viewer'];

/** Espace de connexion porté par une appartenance (le personnel plateforme a sa propre table). */
export type MembershipSpace = 'association' | 'subscriber';

const rolesOf = (space: MembershipSpace): readonly MembershipRole[] =>
  space === 'association' ? MANAGEMENT_ROLES : ['subscriber'];

/** Appartenance active, avec son association (`GET /me`). */
export interface ActiveMembership {
  association: { id: string; name: string; slug: string; status: string; logoFileId: string | null };
  role: MembershipRole;
  title: string | null;
}

/**
 * La personne a-t-elle, dans cet espace, une appartenance d'un de ces statuts ? Connexion : `active` ; activation du
 * compte : `active` ou `invited`. Une appartenance retirée n'ouvre jamais rien.
 */
export function holdsMembership(
  userId: string,
  space: MembershipSpace,
  statuses: readonly MembershipStatus[],
): Promise<boolean> {
  return asSelf(userId, async () => {
    const [row] = await currentTx()
      .select({ one: sql<number>`1` })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          inArray(memberships.role, [...rolesOf(space)]),
          inArray(memberships.status, [...statuses]),
        ),
      )
      .limit(1);
    return row !== undefined;
  });
}

/** Gestion de la personne dans une association : son rôle le plus fort et le statut de l'association. */
export interface ManagementAccess {
  role: ManagementRole;
  associationStatus: string;
}

/**
 * Rôle de gestion actif de la personne dans l'association (le plus fort), avec le statut de l'association (une
 * association suspendue refuse son espace : MembershipGuard) ; `null` si elle n'y gère rien.
 */
export function managementAccessIn(userId: string, associationId: string): Promise<ManagementAccess | null> {
  return asSelf(userId, async () => {
    const rows = await currentTx()
      .select({ role: memberships.role, associationStatus: associations.status })
      .from(memberships)
      .innerJoin(associations, eq(associations.id, memberships.associationId))
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.associationId, associationId),
          eq(memberships.status, 'active'),
          inArray(memberships.role, [...MANAGEMENT_ROLES]),
        ),
      );
    const held = new Set(rows.map((r) => r.role));
    const role = MANAGEMENT_ROLES.find((r) => held.has(r));
    return role && rows[0] ? { role, associationStatus: rows[0].associationStatus } : null;
  });
}

/**
 * Appartenances actives de la personne, avec leur association, dans l'ordre où elle les a rejointes (la première
 * gérée est l'association courante d'un gestionnaire, choix du lot 1.2).
 */
export function activeMembershipsOf(userId: string): Promise<ActiveMembership[]> {
  return asSelf(userId, async () => {
    const rows = await currentTx()
      .select({
        id: associations.id,
        name: associations.name,
        slug: associations.slug,
        status: associations.status,
        logoFileId: associations.logoFileId,
        role: memberships.role,
        title: memberships.title,
      })
      .from(memberships)
      .innerJoin(associations, eq(associations.id, memberships.associationId))
      .where(and(eq(memberships.userId, userId), eq(memberships.status, 'active')))
      .orderBy(sql`${memberships.joinedAt} ASC NULLS LAST`, asc(memberships.createdAt), asc(memberships.id));
    return rows.map(({ role, title, ...association }) => ({ association, role, title }));
  });
}

/**
 * Nombre d'associations où la personne a une appartenance non retirée, quel que soit le rôle (mb.lookup : « compte
 * existant », sans détail, choix Q10 du lot 2.3). Lu « de soi » : un contexte d'association ne voit pas les
 * appartenances d'une personne ailleurs (self_read). Seul cas d'asSelf pour un tiers : `userId` est un compte retrouvé
 * par le serveur (accountByPhone), jamais une valeur du client, et seul un compte sort de l'espace auth. Contexte d'une
 * association seulement. Rétablissement du contexte : tenant-context.test.ts (asSelf).
 */
export function associationsCountOf(userId: string): Promise<number> {
  const context = currentContext();
  if (context?.space !== 'association' || !context.associationId) {
    return Promise.reject(new Error('associationsCountOf : contexte d’une association attendu'));
  }
  return asSelf(userId, async () => {
    const [row] = await currentTx()
      .select({ n: countDistinct(memberships.associationId) })
      .from(memberships)
      .where(and(eq(memberships.userId, userId), ne(memberships.status, 'removed')));
    return row?.n ?? 0;
  });
}
