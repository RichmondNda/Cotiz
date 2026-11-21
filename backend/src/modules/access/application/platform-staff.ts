import { platformStaff } from '@cotiz/db';
import { type AnyColumn, eq, type SQL, sql } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

// Personnel de la plateforme (table globale sans RLS, lot 1.1).

export type PlatformRole = (typeof platformStaff.role.enumValues)[number];

/** Inscrit la personne au personnel de la plateforme, dans la transaction du cas d'usage appelant. */
export async function grantPlatformRole(userId: string, role: PlatformRole): Promise<void> {
  await currentTx().insert(platformStaff).values({ userId, role });
}

/** Rôle de la personne au personnel de la plateforme ; `null` si elle n'en fait pas partie. */
export async function platformRoleOf(userId: string): Promise<PlatformRole | null> {
  const [staff] = await currentTx()
    .select({ role: platformStaff.role })
    .from(platformStaff)
    .where(eq(platformStaff.userId, userId))
    .limit(1);
  return staff?.role ?? null;
}

/**
 * Condition SQL « la personne de cette colonne fait partie du personnel de la plateforme », pour filtrer une liste
 * dans la requête même (pagination et compteurs justes) sans lire `platform_staff` hors du module access.
 */
export function isPlatformStaff(userId: AnyColumn): SQL {
  return sql`EXISTS (SELECT 1 FROM ${platformStaff} WHERE ${platformStaff.userId} = ${userId})`;
}

/** Personne du personnel et son rôle (pf.staff, lot 4.7). */
export interface StaffRow {
  userId: string;
  role: PlatformRole;
  createdAt: Date;
}

/**
 * Verrou transactionnel du personnel : invitations, changements de rôle et retraits sérialisés (le dernier owner actif
 * ne disparaît jamais sous deux requêtes simultanées).
 */
export async function lockPlatformStaff(): Promise<void> {
  await currentTx().execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('platform_staff', 0))`);
}

/** Tout le personnel : owners d'abord, puis admins et supports, chacun par ancienneté. */
export async function platformStaffList(): Promise<StaffRow[]> {
  return currentTx()
    .select({ userId: platformStaff.userId, role: platformStaff.role, createdAt: platformStaff.createdAt })
    .from(platformStaff)
    .orderBy(platformStaff.role, platformStaff.createdAt, platformStaff.userId);
}

/** Nouveau rôle ; `false` si la personne ne fait pas partie du personnel. */
export async function changePlatformRole(userId: string, role: PlatformRole): Promise<boolean> {
  const rows = await currentTx()
    .update(platformStaff)
    .set({ role })
    .where(eq(platformStaff.userId, userId))
    .returning({ userId: platformStaff.userId });
  return rows.length > 0;
}

/**
 * Retire la personne du personnel (ligne supprimée : aucune donnée financière, l'audit garde la trace) ; `false` si elle
 * n'en faisait pas partie. Son compte et ses autres espaces restent.
 */
export async function revokePlatformRole(userId: string): Promise<boolean> {
  const rows = await currentTx()
    .delete(platformStaff)
    .where(eq(platformStaff.userId, userId))
    .returning({ userId: platformStaff.userId });
  return rows.length > 0;
}
