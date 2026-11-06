// Code d'activation remis par une personne (architecture/03) : 8 caractères de l'alphabet sans ambiguïté
// 23456789ABCDEFGHJKMNPQRSTUVWXYZ, affiché `K7M4-P9QX`. La saisie est tolérante : casse, tiret et espaces ignorés,
// comme côté back (`normalizeActivationCode`), pour un code recopié depuis WhatsApp, un SMS ou la fiche imprimée.

const ALPHABET = /^[2-9A-HJKMNP-Z]{8}$/

/** Saisie → 8 caractères en majuscules, sans tiret ni espace (la valeur peut rester invalide). */
export function normaliserCodeActivation(saisie: string): string {
  return saisie.replace(/[\s-]/g, '').toUpperCase()
}

/** Vrai si la saisie, une fois normalisée, est un code de 8 caractères de l'alphabet. */
export function codeActivationValide(saisie: string): boolean {
  return ALPHABET.test(normaliserCodeActivation(saisie))
}

/** Forme affichée `XXXX-XXXX` d'une saisie valide ; la saisie telle quelle sinon (rien n'est perdu). */
export function formaterCodeActivation(saisie: string): string {
  const code = normaliserCodeActivation(saisie)
  return ALPHABET.test(code) ? `${code.slice(0, 4)}-${code.slice(4)}` : saisie
}
