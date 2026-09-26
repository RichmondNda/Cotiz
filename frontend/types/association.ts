import type { DateISO, Identifiant, MoyenPaiement } from './commun'

/** Badges : Active · Impayé · Suspendue · Onboarding. */
export type StatutAssociation = 'active' | 'impayee' | 'suspendue' | 'onboarding'

/** Type déclaré à la demande (liste ouverte dans la spec : « association, mutuelle, tontine, groupement… »). */
export type TypeAssociation = 'association' | 'mutuelle' | 'tontine' | 'groupement' | 'autre'

/** Moyen de paiement configuré par l'association (onboarding étape 3, paramètres, étape 4 d'un projet). */
export interface ModalitePaiement {
  moyen: MoyenPaiement
  iban?: string // virement bancaire
  numeroMobileMoney?: string // mobile money
  operateur?: string // mobile money (Orange, MTN, Moov, Wave… — liste non fixée)
  instructions?: string // espèces, ou consignes libres
}

export interface Association {
  id: Identifiant // ex. `entraide-yopougon`
  nom: string
  sigle?: string // incertain : initiales « EY » peut-être calculées depuis le nom
  type?: TypeAssociation
  ville: string
  pays: string // incertain : toujours « Côte d'Ivoire » dans les maquettes
  description?: string
  logoUrl?: string
  telephoneContact?: string
  emailContact?: string
  numeroEnregistrement?: string
  statut: StatutAssociation
  planId: Identifiant
  /** Prochaine échéance d'abonnement (carte « Abonnement »). */
  abonnementProchaineEcheance?: DateISO
  modalitesPaiement: ModalitePaiement[]
  /** Consignes libres montrées aux souscripteurs (MgParametres, « Instructions complémentaires »). */
  instructionsPaiement?: string
  // Compteurs dénormalisés, affichés dans les listes (super-admin, souscripteur).
  nbProjets: number
  nbSouscripteurs: number
  nbGestionnaires: number
  /** Comptes gestionnaires secondaires autorisés, fixés par la plateforme (MgEquipe : « 2 sur 3 »). */
  limiteComptesSecondaires?: number
  creeeLe: DateISO
}

export type RoleGestionnaire = 'principal' | 'secondaire'

/** Compte gestionnaire d'une association (écran Équipe). */
export interface Gestionnaire {
  id: Identifiant
  associationId: Identifiant
  prenom: string
  nom: string
  fonction?: string // ex. « trésorière »
  email: string
  telephone?: string
  role: RoleGestionnaire
  /** MgEquipe : « Actif » ou « Invitation envoyée » (jamais connecté). */
  statut: 'actif' | 'invite'
  /** `null` : jamais connecté. */
  derniereConnexion?: DateISO | null
}
