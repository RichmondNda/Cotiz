import { users } from '@cotiz/db';
import { and, inArray, notInArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Comptes qui ne reçoivent plus de notification : ils ne peuvent plus se connecter pour les lire. */
const SILENCED_STATUSES = ['disabled', 'anonymized'] as const;

/**
 * Parmi les personnes données, celles dont le compte peut encore recevoir une notification (lot 2.5, suivi) : ni
 * désactivé ni anonymisé, même si une appartenance reste active. Un compte en attente d'activation ou verrouillé
 * reste notifié : il retrouvera ses notifications en se connectant. Espace system seulement (consommateur
 * notifications) : `users` est une table globale sans RLS.
 */
export async function notifiableUsersOf(ids: readonly string[]): Promise<Set<string>> {
  if (currentContext()?.space !== 'system') throw new Error('notifiableUsersOf : espace system seulement');
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await currentTx()
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, unique), notInArray(users.status, [...SILENCED_STATUSES])));
  return new Set(rows.map((r) => r.id));
}
