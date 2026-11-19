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

export interface SessionUsage {
  /** Connexions : sessions ouvertes (premier maillon d'une famille : connexion, activation). */
  logins: number;
  /** Personnes actives : une session ouverte ou renouvelée dans la journée. */
  activeUserIds: string[];
}

/**
 * Connexions et personnes actives d'un espace pendant le jour local `day` (fuseau `timezone`), parmi `userIds`
 * (membres de l'association du contexte, usage_daily, lot 4.6). Chaque renouvellement ajoute une ligne à la famille :
 * une ligne créée dans la journée vaut activité, la première de sa famille vaut connexion. `sessions` est une table
 * globale sans RLS : la liste de personnes fait le périmètre. Colonnes écrites qualifiées (`sessions.`) dans la
 * sous-requête : Drizzle ne qualifie pas celles d'une requête à une seule table, qui viseraient `earlier`.
 */
export async function sessionUsageOf(input: {
  space: 'association' | 'subscriber';
  userIds: readonly string[];
  day: string;
  timezone: string;
}): Promise<SessionUsage> {
  if (currentContext()?.space !== 'association') throw new Error('sessionUsageOf : contexte association attendu');
  if (input.userIds.length === 0) return { logins: 0, activeUserIds: [] };
  const from = sql`(${input.day}::date::timestamp AT TIME ZONE ${input.timezone})`;
  const to = sql`((${input.day}::date + 1)::timestamp AT TIME ZONE ${input.timezone})`;
  const rows = await currentTx()
    .select({
      userId: sessions.userId,
      logins: sql<number>`count(*) FILTER (WHERE NOT EXISTS (
        SELECT 1 FROM sessions earlier
         WHERE earlier.family_id = sessions.family_id AND earlier.created_at < sessions.created_at))`.mapWith(Number),
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.space, input.space),
        sql`${sessions.userId} = ANY(${sql.param([...input.userIds])}::uuid[])`,
        sql`${sessions.createdAt} >= ${from}`,
        sql`${sessions.createdAt} < ${to}`,
      ),
    )
    .groupBy(sessions.userId);
  return { logins: rows.reduce((n, r) => n + r.logins, 0), activeUserIds: rows.map((r) => r.userId) };
}
