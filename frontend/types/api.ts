// Formes des réponses de l'API (mocks Nitro en V0, NestJS ensuite) quand elles joignent plusieurs ressources.
import type { DateISO, Identifiant, MontantFCFA, MoyenPaiement } from './commun'
import type { Association } from './association'
import type { Contrat } from './contrat'
import type { Echeance, RepartitionEcheance } from './echeance'
import type { MotifRejet, Paiement, Preuve } from './paiement'
import type { Projet } from './projet'
import type { Souscripteur, Souscription, StatutSouscription } from './souscripteur'

export type SouscriptionAvecSouscripteur = Souscription & { souscripteur: Souscripteur }
export type SouscriptionAvecProjet = Souscription & { projet: Projet }
export type SouscriptionComplete = Souscription & { projet: Projet, association: Association }

export interface LigneGrilleProjet {
  souscription: Souscription
  souscripteur: Souscripteur
  echeances: Echeance[]
}

/** Événement de la frise d'historique d'un souscripteur (fiche gestionnaire). */
export interface EvenementSouscripteur {
  id: Identifiant
  /** Date ISO, ou placeholder `[DATE]` de la maquette. */
  date: DateISO
  titre: string
  detail?: string
  ton: 'success' | 'warning' | 'danger' | 'info' | 'brand'
}

/** Fiche d'un souscripteur vue par le gestionnaire (`GET /api/souscripteurs/:id`), limitée à son association. */
export interface FicheSouscripteur {
  /** Coordonnées vues par l'association (placeholders `[email]` de la maquette compris). */
  souscripteur: Souscripteur
  souscriptions: (SouscriptionAvecProjet & { echeances: Echeance[] })[]
  /** Statut global : le pire de ses projets engagés. */
  statutGlobal: StatutSouscription
  /** Première inscription à un projet de l'association. */
  membreDepuis: DateISO
  /** Frise complète, plus récent d'abord : paiements, validations, retards et relances, contrats. */
  historique: EvenementSouscripteur[]
}

/** Corps de `PATCH /api/souscripteurs/:id` (« Modifier » de la fiche). */
export type ModificationSouscripteur = Partial<Pick<Souscripteur, 'email' | 'adresse'>>

export type PaiementListe = Paiement & {
  souscripteur: Souscripteur
  projet: Projet
  /** « Validé par » : nom du gestionnaire. */
  traiteParNom?: string
  /** Échéances de la répartition (libellés « Couvre : sept., oct., nov. 2026 »). */
  echeancesCouvertes: Echeance[]
}

/** Versement validé affiché dans la frise du détail d'un paiement (« 25 000 F validé · 05/08/2026 · août »). */
export interface VersementValide {
  echeanceId: Identifiant
  date: DateISO
  montant: MontantFCFA
  /** Gestionnaire qui a validé le paiement correspondant, s'il est connu. */
  traiteParNom?: string
}

export type PaiementDetail = PaiementListe & {
  /** Échéances couvertes (identique à `echeancesCouvertes`). */
  echeances: Echeance[]
  association: Association
  souscription?: Souscription
  /** Toutes les échéances du souscripteur sur le projet, dans l'ordre (situation, ajustement de la répartition). */
  echeancier: Echeance[]
  /** 3 derniers versements validés, hors ce paiement, du plus récent au plus ancien. */
  derniersVersements: VersementValide[]
}

/** Corps de `POST /api/paiements/:id/validation`. */
export interface ValidationPaiement {
  /** Répartition ajustée par le gestionnaire (sinon celle du souscripteur). */
  repartition?: RepartitionEcheance[]
  /** « Le montant reçu est différent ». */
  montantRecu?: MontantFCFA
}

/** Corps de `POST /api/paiements/:id/rejet`. */
export interface RejetPaiement {
  motif: MotifRejet
  message?: string
}

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

// ---------------------------------------------------------------- Détail d'un projet (gestionnaire)

/** Souscripteur en retard (vue d'ensemble : « Retardataires »). */
export interface Retardataire {
  souscripteurId: Identifiant
  nom: string
  nbEcheances: number
  montant: MontantFCFA
  /** Mois des échéances en retard (« août », « septembre »). */
  mois: string[]
}

/** Vue d'ensemble d'un projet (`GET /api/projets/:id/synthese`). */
export interface SyntheseProjet {
  /** Tous les retardataires, du plus gros montant au plus petit (la page en montre 5). */
  retardataires: Retardataire[]
  paiementsAValider: { nombre: number, plusAncienLe?: DateISO }
  contratsNonSignes: { souscripteurId: Identifiant, nom: string, inscritLe: DateISO }[]
  /** Une entrée par échéance du calendrier (hors fonds d'entrée) : attendu et reçu, tous souscripteurs. */
  collecte: CollecteMois[]
}

/** Recherche d'un téléphone avant l'ajout d'un souscripteur. */
export type ResultatRechercheSouscripteur
  = | { cas: 'nouveau' }
    | { cas: 'compte_existant', souscripteur: Souscripteur, nbAssociations: number, projets: string[] }
    | { cas: 'deja_inscrit', souscripteur: Souscripteur }

/** Corps de `POST /api/projets/:id/souscripteurs`. */
export interface NouvelleInscription {
  telephone: string
  /** Compte existant retrouvé : pas de nouveau compte. */
  souscripteurId?: Identifiant
  prenom?: string
  nom?: string
  email?: string
  adresse?: string
  canal?: 'sms' | 'email'
  /** Date d'entrée dans le projet (inscription en cours de route). */
  dateEntree?: DateISO
  /** Rangs des échéances passées à rattraper (0 = fonds d'entrée). */
  rattrapage?: number[]
}

/** Ligne du tableau des rapports (`GET /api/projets/:id/rapport`). */
export interface LigneRapport {
  souscripteurId: Identifiant
  nom: string
  attenduADate: MontantFCFA | null
  verse: MontantFCFA
  reste: MontantFCFA | null
  retards: number
  dernierPaiement?: DateISO
}

export interface RapportProjet {
  lignes: LigneRapport[]
  /** Taux de recouvrement cumulé après chaque échéance échue, en %. */
  tauxParEcheance: { mois: DateISO, taux: number }[]
  statuts: { aJour: number, enRetard: number, signature: number }
  /** V1 : graphiques avancés pas encore disponibles (état « Bientôt disponible »). */
  graphiquesDisponibles: boolean
}

/** Contrat d'un projet vu par le gestionnaire (`GET /api/projets/:id/contrat`) : modèle commun et suivi des signatures. */
export interface ContratProjet {
  association: { nom: string, ville?: string }
  /** Texte du modèle, variables du projet remplacées ; `{nom_souscripteur}` reste tel quel. `**…**` = gras. */
  texte: string
  /** Signature de l'association à la création du projet. */
  signataire?: { nom: string, fonction?: string, signeLe: DateISO }
  /** `[N]` tant que le nombre de souscripteurs est un placeholder (Voyage solidaire). */
  signes: number | '[N]'
  total: number | '[N]'
  nonSignataires: { souscripteurId: Identifiant, nom: string, inscritLe: DateISO }[]
}

/** Ligne d'un fichier d'import analysé. */
export interface LigneImport {
  ligne: number
  prenom: string
  nom: string
  telephone: string
  email?: string
  adresse?: string
  statut: 'prete' | 'compte_existant' | 'telephone_incomplet' | 'prenom_manquant' | 'doublon'
  /** Doublon : ligne d'origine. */
  doublonDe?: number
}

/** Résultat de `POST /api/projets/:id/import/analyse` (fichier simulé en V0). */
export interface AnalyseImport {
  fichier: string
  nbLignes: number
  colonnes: { colonne: string, exemples: string[], champ: 'prenom' | 'nom' | 'telephone' | 'email' | 'adresse' | null }[]
  compteurs: { pretes: number, comptesExistants: number, erreurs: number, doublons: number }
  /** Lignes à examiner (erreurs, doublons) et exemples de lignes prêtes. */
  lignes: LigneImport[]
}

/** Corps de `PATCH /api/projets/:id` (paramètres modifiables après création). */
export type ModificationProjet = Partial<Pick<Projet,
  'nom' | 'description' | 'imageCouvertureNom' | 'souscripteursRequis' | 'modalitesPaiement' | 'instructionsPaiement' | 'delaiGraceJours'
>>

// ---------------------------------------------------------------- Relances (gestionnaire)

/** Souscripteur en retard sur un projet (onglet Retardataires de MgRelances). */
export interface LigneRetard {
  souscripteurId: Identifiant
  nom: string
  telephone: string
  projetId: Identifiant
  nomProjet: string
  /** Échéances en retard, de la plus ancienne à la plus récente (partielles comprises). */
  echeances: { date: DateISO, partielle: boolean }[]
  montant: MontantFCFA
  retardDepuis: DateISO
  derniereRelance?: { type: 'auto' | 'manuelle', date: DateISO }
}

/** Règle de relance automatique (onglet Relances automatiques). */
export interface RegleRelance {
  id: Identifiant
  titre: string
  description: string
  ton: 'info' | 'warning' | 'danger'
  active: boolean
}

/** Envoi de relances (onglet Historique des envois). */
export interface EnvoiRelance {
  id: Identifiant
  date: DateISO
  type: 'automatique' | 'manuelle'
  projet: string
  destinataires: number | '[N]'
  /** « Cotiz · règle « 15 jours » », « Awa Koné ». */
  par: string
}

/** `GET /api/relances` — relances de l'association du gestionnaire. */
export interface Relances {
  retardataires: LigneRetard[]
  /** Souscripteurs en retard / actifs (KPI « 14 sur 52 »). */
  nbEnRetard: number
  nbActifs: number
  /** Cumul des échéances non payées (placeholder de la maquette). */
  montantEnRetard: MontantFCFA | '[MONTANT]'
  derniereAuto?: { date: DateISO, regle: string, envois: number }
  regles: RegleRelance[]
  historique: EnvoiRelance[]
}

// ---------------------------------------------------------------- Contrats (gestionnaire)

/** Contrat d'un projet vu depuis la page Contrats (`GET /api/gestionnaire/contrats`) : conditions et suivi des signatures. */
export interface SyntheseContratProjet {
  projetId: Identifiant
  nomProjet: string
  /** « 50 000 F à l'entrée, puis 25 000 F par mois pendant 18 mois. Total : 500 000 F. » */
  conditions: string
  /** Signature de l'association : signataire et date (ou `[DATE]`). */
  signeParAssociation: { nom: string, le: DateISO }
  signes: number | '[N]'
  total: number | '[N]'
  /** Cycle roulant aux inscriptions ouvertes : places du cycle (« 12 / 30 places »). */
  places?: number
  /** Contre-signatures attendues ; null quand le projet n'en attend pas (inscriptions ouvertes). */
  enAttente: number | '[N]' | null
  statut: 'actif' | 'signatures_en_cours' | 'inscriptions_ouvertes'
  nonSignataires: { souscripteurId: Identifiant, nom: string, inviteLe: DateISO }[]
}
