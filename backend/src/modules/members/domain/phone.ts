import { parsePhoneNumberFromString } from 'libphonenumber-js/max';

/**
 * Téléphone d'un souscripteur, déjà au format E.164 (contrat : PhoneE164), revalidé par libphonenumber-js (métadonnées
 * complètes : longueur et plages du pays, choix Q4 du lot 2.3) et remis sous sa forme canonique. `null` : numéro
 * invalide (`invalid_phone`).
 */
export function normalizePhone(phone: string): string | null {
  const parsed = parsePhoneNumberFromString(phone);
  return parsed?.isValid() ? parsed.number : null;
}
