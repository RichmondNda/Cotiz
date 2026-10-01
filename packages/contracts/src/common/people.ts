import { z } from 'zod';
import { Uuid } from './scalars.js';

/** Téléphone au format E.164 (`+2250544218790`), identifiant du souscripteur. */
export const PhoneE164 = z.string().regex(/^\+[1-9]\d{6,14}$/, 'e164');

export const Email = z.email();

/** Mot de passe choisi par la personne (la robustesse est contrôlée par le back : `weak_password`). */
export const NewPassword = z.string().min(8).max(128);

/** Référence courte à une personne (« validé par Aminata K. »). */
export const PersonRef = z.object({
  id: Uuid,
  firstName: z.string(),
  lastName: z.string(),
});
export type PersonRef = z.infer<typeof PersonRef>;

/** Personne avec ses coordonnées (fiches, demandes de réinitialisation). */
export const PersonContact = PersonRef.extend({
  phone: PhoneE164.nullable(),
  email: Email.nullable(),
});
export type PersonContact = z.infer<typeof PersonContact>;
