import { platformStaff } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { currentTx } from '../../shared/tenant-context/index.js';

// Surface publique du module access (personnel de la plateforme ; appartenances aux associations au lot 1.2).

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
