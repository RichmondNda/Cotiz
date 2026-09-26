// Formes des réponses de l'API (mocks Nitro en V0, NestJS ensuite) quand elles joignent plusieurs ressources.
import type { DateISO, Identifiant, MontantFCFA, MoyenPaiement } from './commun'
import type { Association } from './association'
import type { Contrat } from './contrat'
import type { Echeance, RepartitionEcheance } from './echeance'
import type { Paiement, Preuve } from './paiement'
import type { Projet } from './projet'
import type { Souscripteur, Souscription } from './souscripteur'

export type SouscriptionAvecSouscripteur = Souscription & { souscripteur: Souscripteur }
export type SouscriptionAvecProjet = Souscription & { projet: Projet }
export type SouscriptionComplete = Souscription & { projet: Projet, association: Association }

export interface LigneGrilleProjet {
  souscription: Souscription
  souscripteur: Souscripteur
  echeances: Echeance[]
}

export interface FicheSouscripteur {
  souscripteur: Souscripteur
  souscriptions: SouscriptionAvecProjet[]
}

export type PaiementListe = Paiement & { souscripteur: Souscripteur, projet: Projet }
export type PaiementDetail = PaiementListe & { echeances: Echeance[], association: Association }

export type ContratDetaille = Contrat & { projet: Projet, souscripteur: Souscripteur, association: Association }

// ---------------------------------------------------------------- Espace souscripteur (`/api/moi/...`)

/** Situation d'une souscription calculée à partir de ses échéances (cartes projet, associations). */
export interface SituationSouscription {
  nbEcheancesEnRetard: number
  /** Date de la plus ancienne échéance en retard (« depuis le 5 août »). */
  retardDepuis?: DateISO
  /** Prochaine échéance à venir. */
  prochaine?: { date: DateISO, montant: MontantFCFA }
}

export type SouscriptionMembre = SouscriptionComplete & SituationSouscription

/** Détail d'un projet vu par le souscripteur (`/api/moi/souscriptions/:projetId`). */
export type DetailSouscriptionMembre = SouscriptionMembre & {
  echeances: Echeance[]
  /** Paiements déclarés sur ce projet, plus récents d'abord. */
  paiements: Paiement[]
  contrat?: Contrat
}

/** Association du souscripteur et ses projets (`/api/moi/associations`). */
export interface AssociationMembre {
  association: Association
  /** Date de la première inscription à un projet de l'association. */
  membreDepuis: DateISO
  souscriptions: SouscriptionMembre[]
}

/** Corps de `POST /api/declarations`. */
export interface NouvelleDeclaration {
  projetId: Identifiant
  montant: MontantFCFA
  repartition: RepartitionEcheance[]
  moyen: MoyenPaiement
  dateVirement: DateISO
  preuve: Preuve
  commentaire?: string
}

// ---------------------------------------------------------------- Espace gestionnaire

/** Mois du graphique « Collecte mensuelle — attendu vs reçu » (tous projets). */
export interface CollecteMois {
  /** Premier jour du mois (`2026-09-01`). */
  mois: DateISO
  attendu: MontantFCFA
  recu: MontantFCFA
  enCours?: boolean
}

/** Contrat envoyé et toujours pas signé (bandeau « À faire » du tableau de bord). */
export interface ContratEnSouffrance {
  contratId: Identifiant
  souscripteurId: Identifiant
  nomSouscripteur: string
  projetId: Identifiant
  nomProjet: string
}

/** Tableau de bord gestionnaire (`GET /api/gestionnaire/tableau-de-bord`). */
export interface TableauDeBordGestionnaire {
  association: { id: Identifiant, nom: string }
  /** Mois en cours, tous projets. */
  collecteMois: { collecte: MontantFCFA, attendu: MontantFCFA }
  paiementsAValider: { nombre: number, plusAncienLe?: DateISO }
  enRetard: { nombre: number, actifs: number }
  tauxRecouvrement: number
  nbSouscripteurs: number
  nbProjets: number
  /** Contrats non signés depuis plus de 7 jours. */
  contratsNonSignes: ContratEnSouffrance[]
  /** 6 derniers mois, le dernier est le mois en cours. */
  collecteMensuelle: CollecteMois[]
}

/** Corps de `POST /api/projets` (création en 6 étapes). */
export type NouveauProjet = Pick<Projet,
  'nom' | 'description' | 'fondsEntree' | 'montantEcheance' | 'frequence' | 'jourEcheance'
  | 'typeCalendrier' | 'dateDebut' | 'dateFin' | 'delaiGraceJours' | 'souscripteursRequis'
  | 'modalitesPaiement' | 'instructionsPaiement' | 'contratModele'
> & {
  signataire: { nom: string, fonction: string }
  /** Case « Je signe ce contrat au nom de l'association ». */
  contratSigne: boolean
  /** Enregistrement comme brouillon (« Enregistrer le brouillon »). */
  brouillon?: boolean
}

/** Corps de `PATCH /api/associations/:id` (onboarding étapes 2 et 3, paramètres). */
export type ModificationAssociation = Partial<Pick<Association,
  'nom' | 'description' | 'ville' | 'telephoneContact' | 'emailContact' | 'logoUrl' | 'modalitesPaiement'
>>
