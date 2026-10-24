import type { PasswordResetRequest } from '@cotiz/contracts';
import { passwordResetRequests } from '@cotiz/db';
import { and, eq, isNull, not } from 'drizzle-orm';
import { isPlatformStaff } from '../../access/access.public.js';
import { platformPersonContactsOf, platformPersonRefsOf } from './person-refs.js';

export type ResetRequestRow = typeof passwordResetRequests.$inferSelect;

/**
 * Demandes traitées par la plateforme (pf.resets) : celles des gestionnaires (espace association, sans association).
 * Les demandes des souscripteurs sont traitées par leur association, celles du personnel plateforme par le script
 * `reset-password` : y compris celles d'un membre du personnel qui gère aussi une association (sinon un admin prendrait
 * le compte d'un owner, le mot de passe valant pour tous les espaces). La connexion plateforme contourne la RLS : ce
 * filtre est la seule barrière, toujours appliqué.
 */
export const platformHandled = and(
  eq(passwordResetRequests.space, 'association'),
  isNull(passwordResetRequests.associationId),
  not(isPlatformStaff(passwordResetRequests.userId)),
);

/** Lignes → demandes du contrat (personne et auteur du traitement lus en une fois). Plateforme seulement. */
export async function toResetRequests(rows: readonly ResetRequestRow[]): Promise<PasswordResetRequest[]> {
  const contacts = await platformPersonContactsOf(rows.map((r) => r.userId));
  const refs = await platformPersonRefsOf(rows.flatMap((r) => (r.handledBy ? [r.handledBy] : [])));
  return rows.map((row) => {
    const user = contacts.get(row.userId);
    if (!user) throw new Error(`demande ${row.id} : personne introuvable`);
    return {
      id: row.id,
      space: row.space,
      status: row.status,
      user,
      createdAt: row.createdAt.toISOString(),
      handledAt: row.handledAt?.toISOString() ?? null,
      handledBy: row.handledBy ? (refs.get(row.handledBy) ?? null) : null,
    };
  });
}
