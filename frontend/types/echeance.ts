import type { DateISO, Identifiant, MontantFCFA } from './commun'

/**
 * Badges : À venir · Déclarée · Payée · Partielle · En retard.
 * Codes de la grille de la maquette : `f` a_venir · `W` declaree · `o` payee · `P` partielle · `l` en_retard.
 */
export type StatutEcheance = 'a_venir' | 'declaree' | 'payee' | 'partielle' | 'en_retard'

export interface Echeance {
  id: Identifiant
  projetId: Identifiant
  souscripteurId: Identifiant
  /** Rang dans la grille. 0 = fonds d'entrée (1re cellule), puis 1..n. */
  rang: number
  estFondsEntree: boolean
  date: DateISO // date d'exigibilité (le 5 du mois pour Centre communautaire)
  montant: MontantFCFA
  montantPaye: MontantFCFA // validé ; < montant si partielle
  statut: StatutEcheance
}

/** Affectation d'une partie d'un paiement à une échéance (sélecteur d'échéances couvertes). */
export interface RepartitionEcheance {
  echeanceId: Identifiant
  montantAffecte: MontantFCFA // < montant de l'échéance => « partielle »
}
