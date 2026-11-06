import type { PasswordResetRequest, PersonContact, PersonRef } from '@cotiz/contracts';
import { memberships, passwordResetRequests, users } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import type { ResetRequestRow } from './platform-reset-requests.js';

/** L'association du contexte (identifiant de l'URL en minuscules, comme MembershipGuard), sinon erreur. */
export function resetsAssociationId(aid: string): string {
  const context = currentContext();
  const id = aid.toLowerCase();
  if (context?.space !== 'association' || context.associationId !== id) {
    throw new Error('as.resets : contexte de cette association attendu');
  }
  return id;
}

/**
 * Demandes traitées par l'association (as.resets) : celles de ses souscripteurs (espace souscripteur, cette
 * association). La RLS (tenant_manage) ne montre déjà que les lignes de l'association du contexte : la condition le
 * redit, pour qu'une erreur de contexte ne devienne jamais une fuite.
 */
export const associationHandled = (associationId: string) =>
  and(eq(passwordResetRequests.space, 'subscriber'), eq(passwordResetRequests.associationId, associationId));

/**
 * Coordonnées des personnes liées à l'association (appartenance de tout rôle et tout statut, lue sous RLS) : `users`
 * est une table globale sans RLS, la jointure sur les appartenances de l'association est la barrière.
 */
async function associationPeopleOf(associationId: string, ids: readonly string[]): Promise<Map<string, PersonContact>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await currentTx()
    .selectDistinct({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      phone: users.phoneE164,
      email: users.email,
    })
    .from(users)
    .innerJoin(memberships, eq(memberships.userId, users.id))
    .where(and(inArray(users.id, unique), eq(memberships.associationId, associationId)));
  return new Map(rows.map((r) => [r.id, r]));
}

/** Lignes → demandes du contrat (personne et auteur du traitement lus en une fois), dans le contexte de l'association. */
export async function toAssociationResetRequests(
  associationId: string,
  rows: readonly ResetRequestRow[],
): Promise<PasswordResetRequest[]> {
  const people = await associationPeopleOf(associationId, [
    ...rows.map((r) => r.userId),
    ...rows.flatMap((r) => (r.handledBy ? [r.handledBy] : [])),
  ]);
  return rows.map((row) => {
    const user = people.get(row.userId);
    if (!user) throw new Error(`demande ${row.id} : personne introuvable dans l'association`);
    const handler = row.handledBy ? people.get(row.handledBy) : undefined;
    const handledBy: PersonRef | null = handler
      ? { id: handler.id, firstName: handler.firstName, lastName: handler.lastName }
      : null;
    return {
      id: row.id,
      space: row.space,
      status: row.status,
      user,
      createdAt: row.createdAt.toISOString(),
      handledAt: row.handledAt?.toISOString() ?? null,
      handledBy,
    };
  });
}
