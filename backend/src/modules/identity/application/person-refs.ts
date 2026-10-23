import type { PersonContact, PersonRef } from '@cotiz/contracts';
import { users } from '@cotiz/db';
import { inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Prénom et nom des personnes données (auteurs d'une décision, d'une consultation), par identifiant. Plateforme
 * seulement : `users` est une table globale sans RLS, ailleurs un nom complet d'une autre association fuirait
 * (les espaces association et souscripteur passent par les vues prénom + initiale).
 */
export async function platformPersonRefsOf(ids: readonly string[]): Promise<Map<string, PersonRef>> {
  if (currentContext()?.space !== 'platform') throw new Error('platformPersonRefsOf : espace plateforme seulement');
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Coordonnées des personnes données (équipe d'une association), par identifiant. Plateforme seulement. */
export async function platformPersonContactsOf(ids: readonly string[]): Promise<Map<string, PersonContact>> {
  if (currentContext()?.space !== 'platform') throw new Error('platformPersonContactsOf : espace plateforme seulement');
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await currentTx()
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phoneE164,
      email: users.email,
    })
    .from(users)
    .where(inArray(users.id, unique));
  return new Map(rows.map((r) => [r.id, r]));
}
