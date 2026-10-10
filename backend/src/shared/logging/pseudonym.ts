import { createHmac } from 'node:crypto';

/**
 * Référence pseudonyme d'un utilisateur dans les journaux : HMAC-SHA256 de son identifiant, tronqué à 64 bits. Stable
 * pour une clé (on suit un même utilisateur d'une ligne à l'autre), non réversible sans la clé.
 */
export function pseudonymize(userId: string, key: string): string {
  return createHmac('sha256', key).update(userId).digest('hex').slice(0, 16);
}
