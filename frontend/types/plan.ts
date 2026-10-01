import type { Identifiant, MontantFCFA, Quota } from './commun'

export type StatutPlan = 'actif' | 'archive'

export interface Plan {
  id: Identifiant
  nom: string // Découverte, Essentiel, Pro
  /** Phrase affichée sous le nom sur la carte tarif (SaPlan). */
  description?: string
  /** Prix non fournis : `[PRIX]` dans toutes les maquettes. */
  prixMensuel: MontantFCFA | '[PRIX]'
  prixAnnuel: MontantFCFA | '[PRIX]'
  quotas: {
    projets: Quota // projets actifs
    souscripteurs: Quota
    gestionnaires: Quota
  }
  fonctionnalites: string[] // liste cochée des cartes de tarif (landing, étape 3 de /demande)
  associationsAbonnees: number
  /** Plan mis en avant sur la landing (« Le plus choisi », étoile dans SaPlans). */
  misEnAvant: boolean
  statut: StatutPlan
  /** Version lue (verrouillage optimiste des modifications). */
  version?: number
  /** Code stable du plan (`essentiel`). */
  code?: string
}
