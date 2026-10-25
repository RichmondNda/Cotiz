import { users } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/**
 * Compte retrouvé par son téléphone (ajout d'un souscripteur) : prénom, initiale du nom et statut seulement, jamais le
 * nom complet ni les coordonnées (architecture/04 § 4.3).
 */
export interface PhoneAccount {
  id: string;
  firstName: string;
  lastInitial: string;
  status: (typeof users.status.enumValues)[number];
}

/** Initiale (majuscule, un seul caractère UTF-16 : contrat `length(1)`) du nom, sinon du prénom ; `?` à défaut. */
export function initialOf(lastName: string, firstName: string): string {
  for (const name of [lastName, firstName]) {
    const code = name.trim().codePointAt(0);
    const first = code === undefined ? undefined : String.fromCodePoint(code).toUpperCase();
    if (first?.length === 1) return first;
  }
  return '?';
}

/**
 * Compte de ce téléphone E.164 (clé de dédoublonnage des souscripteurs, users.phone_e164 unique) ; `null` sinon.
 * Contexte d'une association seulement : `users` est globale sans RLS, seuls le prénom et l'initiale du nom en sortent.
 */
export async function accountByPhone(phone: string): Promise<PhoneAccount | null> {
  const context = currentContext();
  if (context?.space !== 'association' || !context.associationId) {
    throw new Error('accountByPhone : contexte d’une association attendu');
  }
  const [row] = await currentTx()
    .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, status: users.status })
    .from(users)
    .where(eq(users.phoneE164, phone))
    .limit(1);
  return row
    ? { id: row.id, firstName: row.firstName, lastInitial: initialOf(row.lastName, row.firstName), status: row.status }
    : null;
}
