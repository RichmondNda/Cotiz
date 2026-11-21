import { sessions, users } from '@cotiz/db';
import { desc, eq } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** Nombre de connexions reprises dans l'export de ses données. */
export const EXPORTED_SESSIONS = 50;

/**
 * Compte et connexions récentes de la personne du jeton, pour l'export de ses données (me.profile › export, lot 4.7).
 * Jamais de haché (mot de passe, jeton de rafraîchissement) : seules ces colonnes sont lues. `userId` vient toujours du
 * contexte posé par les gardes, jamais du client.
 */
export async function personalAccountOf(userId: string) {
  const tx = currentTx();
  const [account] = await tx
    .select({ status: users.status, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;
  const recent = await tx
    .select({
      space: sessions.space,
      createdAt: sessions.createdAt,
      lastUsedAt: sessions.lastUsedAt,
      expiresAt: sessions.expiresAt,
      revokedAt: sessions.revokedAt,
      ip: sessions.ip,
      userAgent: sessions.userAgent,
    })
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.createdAt), desc(sessions.id))
    .limit(EXPORTED_SESSIONS);
  return { account, sessions: recent };
}
