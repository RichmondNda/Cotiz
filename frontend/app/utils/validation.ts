// Règles de saisie des formulaires publics (demande, connexions, mot de passe oublié).

/** Chiffres nationaux d'un numéro ivoirien saisi avec ou sans indicatif (`+225 05 44…` → `0544…`). */
export function chiffresTelephone(saisie: string): string {
  const c = saisie.replace(/\D/g, '')
  return c.startsWith('225') && c.length === 13 ? c.slice(3) : c
}

/** Numéro national à 10 chiffres. */
export const telephoneValide = (saisie: string) => chiffresTelephone(saisie).length === 10

export const emailValide = (saisie: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(saisie.trim())

/** Saisie d'un numéro groupée par paires (`0544218790` → `05 44 21 87 90`), 10 chiffres au plus. */
export function formatSaisieTelephone(saisie: string): string {
  return saisie.replace(/\D/g, '').slice(0, 10).replace(/(\d{2})(?=\d)/g, '$1 ')
}
