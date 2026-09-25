import type { DateISO, Frequence, Identifiant, MontantFCFA } from './commun'
import type { ModalitePaiement } from './association'

/** Badges : Brouillon · Inscriptions ouvertes · En cours · Terminé. */
export type StatutProjet = 'brouillon' | 'inscriptions_ouvertes' | 'en_cours' | 'termine'

/** Contrôle segmenté de l'étape 3 : « Dates fixes » / « Cycle roulant ». */
export type TypeCalendrier = 'dates_fixes' | 'cycle_roulant'

export interface Projet {
  id: Identifiant
  associationId: Identifiant
  nom: string
  description?: string
  imageCouvertureUrl?: string
  statut: StatutProjet

  // Financement
  fondsEntree: MontantFCFA | null // null = pas de fonds d'entrée (interrupteur désactivé)
  montantEcheance: MontantFCFA
  frequence: Frequence
  jourEcheance?: number // ex. 5 = « le 5 du mois »

  // Calendrier
  typeCalendrier: TypeCalendrier
  dateDebut: DateISO
  dateFin?: DateISO // dates fixes uniquement
  nbEcheances?: number // dates fixes : calculé (ex. 18)
  delaiGraceJours: number // délai avant passage « en retard »

  /** null = « sans limite ». Tontine : 30 requis. */
  souscripteursRequis: number | null
  modalitesPaiement: ModalitePaiement[]
  instructionsPaiement?: string
  contratModele: string // texte avec variables {nom_souscripteur}, {montant}, {frequence}, {date_debut}

  // Indicateurs (calculés côté back, dénormalisés pour les listes et tableaux de bord)
  nbSouscripteurs: number
  montantCollecte: MontantFCFA
  montantAttenduADate: MontantFCFA
  tauxRecouvrement: number // en % entier (82)
  nbEnRetard: number
  nbPaiementsAValider: number
  prochaineEcheance?: DateISO
  /** Engagement total par souscripteur (dates fixes) : fonds d'entrée + n × échéance. */
  engagementParSouscripteur?: MontantFCFA
}
