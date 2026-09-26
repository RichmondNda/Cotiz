// Robustesse d'un mot de passe (première connexion, mot de passe oublié). Partagé avec les mocks serveur.
// 4 règles ; niveau affiché sur 4 segments. Correspondance maquette : « cotiz2026 » → 3 segments « correcte »
// (orange), « Cotiz2026 » → 3 segments « bonne » (vert).

export interface RegleMotDePasse {
  libelle: string
  ok: boolean
}

export type NiveauRobustesse = 'vide' | 'faible' | 'correcte' | 'bonne' | 'excellente'

export function reglesMotDePasse(mdp: string): RegleMotDePasse[] {
  return [
    { libelle: '8 caractères minimum', ok: mdp.length >= 8 },
    { libelle: 'Une majuscule', ok: /[A-Z]/.test(mdp) },
    { libelle: 'Un chiffre', ok: /\d/.test(mdp) },
    { libelle: 'Un caractère spécial', ok: /[^A-Za-z0-9]/.test(mdp) },
  ]
}

export function robustesse(mdp: string): { niveau: NiveauRobustesse, segments: number } {
  if (!mdp) return { niveau: 'vide', segments: 0 }
  const n = reglesMotDePasse(mdp).filter(r => r.ok).length
  if (n >= 4) return { niveau: 'excellente', segments: 4 }
  if (n === 3) return { niveau: 'bonne', segments: 3 }
  if (n === 2) return { niveau: 'correcte', segments: 3 }
  return { niveau: 'faible', segments: n === 1 ? 2 : 1 }
}

/** Accepté à l'enregistrement : au moins 8 caractères et une robustesse « correcte ». */
export function motDePasseAcceptable(mdp: string): boolean {
  const { niveau } = robustesse(mdp)
  return mdp.length >= 8 && (niveau === 'correcte' || niveau === 'bonne' || niveau === 'excellente')
}

/** Formulaire « nouveau mot de passe » complet : robustesse suffisante et confirmation identique. */
export function nouveauMotDePasseValide(motDePasse: string, confirmation: string): boolean {
  return motDePasseAcceptable(motDePasse) && motDePasse === confirmation
}
