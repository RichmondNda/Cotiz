import { notifications as t } from '@cotiz/db';
import { and, eq, inArray, isNull, type SQL, sql } from 'drizzle-orm';
import { activeMembershipsOf, MANAGEMENT_ROLES, platformRoleOf } from '../../access/access.public.js';
import type { Actor } from '../../../shared/http/index.js';

/**
 * Notifications visibles dans l'espace courant (endpoints.yaml, nt.list : « espace courant ») : la personne du jeton
 * seulement (RLS owner_access), et parmi elles :
 * - souscripteur : audience `subscriber`, des associations où elle est souscriptrice active ;
 * - association : audience `manager`, de l'association courante (celle de `GET /me` : la première gérée), tant que
 *   l'appartenance de gestion est active ;
 * - plateforme : audience `platform`, pour le personnel de la plateforme seulement.
 * `key` distingue les compteurs mis en cache d'une même personne ; `where` vaut `null` quand rien n'est visible.
 */
export interface NotificationScope {
  key: string;
  where: SQL | null;
}

const audienceIs = (audience: string) => sql`${t.data}->>'audience' = ${audience}`;
const isManagement = (role: string) => (MANAGEMENT_ROLES as readonly string[]).includes(role);

export async function notificationScopeOf(actor: Actor): Promise<NotificationScope> {
  const own = eq(t.userId, actor.userId);
  if (actor.space === 'subscriber') {
    const ids = (await activeMembershipsOf(actor.userId))
      .filter((m) => m.role === 'subscriber')
      .map((m) => m.association.id)
      .sort();
    return {
      key: `subscriber:${ids.join(',')}`,
      where: ids.length === 0 ? null : (and(own, audienceIs('subscriber'), inArray(t.associationId, ids)) ?? null),
    };
  }
  if (actor.space === 'association') {
    const current = (await activeMembershipsOf(actor.userId)).find((m) => isManagement(m.role));
    if (!current) return { key: 'association:', where: null };
    return {
      key: `association:${current.association.id}`,
      where: and(own, audienceIs('manager'), eq(t.associationId, current.association.id)) ?? null,
    };
  }
  if (actor.space === 'platform' && (await platformRoleOf(actor.userId)) !== null) {
    return { key: 'platform', where: and(own, audienceIs('platform'), isNull(t.associationId)) ?? null };
  }
  return { key: actor.space, where: null };
}
