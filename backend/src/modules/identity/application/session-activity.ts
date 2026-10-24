import { sessions } from '@cotiz/db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Dernière activité de chaque personne donnée dans l'espace association : ouverture ou dernier rafraîchissement d'une
 * de ses sessions, révoquées comprises (dernière activité d'une association, en attendant `usage_daily` au lot 4.6).
 * Personne sans session : absente. Plateforme seulement : `sessions` est une table globale sans RLS.
 */
export async function platformManagerActivityOf(userIds: readonly string[]): Promise<Map<string, Date>> {
  if (currentContext()?.space !== 'platform')
    throw new Error('platformManagerActivityOf : espace plateforme seulement');
  const unique = [...new Set(userIds)];
  if (unique.length === 0) return new Map();
  const rows = await currentTx()
    .select({
      userId: sessions.userId,
      // Groupé par personne : au moins une session, donc jamais NULL.
      at: sql<Date>`max(coalesce(${sessions.lastUsedAt}, ${sessions.createdAt}))`.mapWith(sessions.createdAt),
    })
    .from(sessions)
    .where(and(inArray(sessions.userId, unique), eq(sessions.space, 'association')))
    .groupBy(sessions.userId);
  return new Map(rows.map((r) => [r.userId, r.at]));
}
