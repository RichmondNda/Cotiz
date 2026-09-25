/** Montant en francs CFA, entier (pas de décimales). Affichage via formatFCFA(). */
export type MontantFCFA = number

/** Date ISO 8601 (`2026-10-05` ou `2026-10-05T09:30:00Z`). Formatage français côté front. */
export type DateISO = string

export type Identifiant = string

/** Rôle de la session mockée (cookie `cotiz_role`). */
export type Role = 'souscripteur' | 'gestionnaire' | 'superadmin'

export type MoyenPaiement = 'virement' | 'mobile_money' | 'especes'

export type Frequence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle'

/**
 * Limite d'un quota de plan. `null` = illimité (case « illimité » de SaPlan).
 * Les maquettes affichent `[N]` pour les plans Découverte et Essentiel : on garde la chaîne telle quelle.
 */
export type Quota = number | null | '[N]'
