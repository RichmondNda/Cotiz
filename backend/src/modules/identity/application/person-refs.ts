import type { PersonContact, PersonRef } from '@cotiz/contracts';
import { memberships, users } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
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

/**
 * Prénom et nom d'une personne liée à l'association du contexte (appartenance de tout rôle et tout statut, lue sous
 * RLS), pour le texte d'une notification lue par ses gestionnaires (lot 2.5) ; `null` pour une personne étrangère à
 * l'association : jamais le nom d'une autre association.
 */
export async function associationPersonNameOf(associationId: string, userId: string): Promise<string | null> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('associationPersonNameOf : contexte de cette association seulement');
  }
  const [row] = await currentTx()
    .select({ firstName: users.firstName, lastName: users.lastName })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(eq(users.id, userId), eq(memberships.associationId, associationId)))
    .limit(1);
  return row ? `${row.firstName} ${row.lastName}`.trim() : null;
}
