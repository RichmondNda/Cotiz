// Types d'interface des écrans qui joignent plusieurs ressources, produits par composables/api/vues/* à partir de @cotiz/contracts.
import type { Currency } from '@cotiz/contracts'
import type { DateISO, Identifiant, MontantFCFA, MoyenPaiement, Quota } from './commun'
import type { Association, Gestionnaire, RoleGestionnaire } from './association'
import type { Contrat } from './contrat'
import type { Echeance, RepartitionEcheance } from './echeance'
import type { MotifRejet, Paiement, Preuve } from './paiement'
import type { AccesARemettre } from './plateforme'
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

/** Fiche d'un souscripteur vue par le gestionnaire (`mb.get › get + mb.timeline › list`), limitée à son association. */
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
  /** Compte pas encore activé : « Renvoyer les identifiants » (nouveau code à remettre). */
  activationEnAttente: boolean
  /** Version lue (If-Match de « Modifier »). */
  version: number
}

/** Corps de `mb.patch › patch` (« Modifier » de la fiche). */
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
  /** Gestionnaire : version et devise du paiement affiché (If-Match des décisions). */
  etat?: EtatPaiement
  /** Échéances couvertes (identique à `echeancesCouvertes`). */
  echeances: Echeance[]
  association: Association
  souscription?: Souscription
  /** Toutes les échéances du souscripteur sur le projet, dans l'ordre (situation, ajustement de la répartition). */
  echeancier: Echeance[]
  /** 3 derniers versements validés, hors ce paiement, du plus récent au plus ancien. */
  derniersVersements: VersementValide[]
}

/** Corps de `lg.pay.validate › validate`. */
/** Version (If-Match) et devise du paiement affiché, pour décider sur ce qui est vu. */
export interface EtatPaiement {
  version: number
  devise: Currency
}

export interface ValidationPaiement {
  /** Paiement affiché (détail) ; absent (écrans de liste) : relu juste avant l'envoi. */
  etat?: EtatPaiement
  /** Répartition ajustée par le gestionnaire (sinon celle du souscripteur). */
  repartition?: RepartitionEcheance[]
  /** « Le montant reçu est différent ». */
  montantRecu?: MontantFCFA
}

/** Corps de `lg.pay.reject › reject`. */
export interface RejetPaiement {
  /** Paiement affiché (détail) ; absent (écrans de liste) : relu juste avant l'envoi. */
  etat?: EtatPaiement
  motif: MotifRejet
  message?: string
}

export type ContratDetaille = Contrat & { projet: Projet, souscripteur: Souscripteur, association: Association }

// ---------------------------------------------------------------- Espace souscripteur (`me.*`)

/** Situation d'une souscription calculée à partir de ses échéances (cartes projet, associations). */
export interface SituationSouscription {
  nbEcheancesEnRetard: number
  /** Date de la plus ancienne échéance en retard (« depuis le 5 août »). */
  retardDepuis?: DateISO
  /** Prochaine échéance à venir. */
  prochaine?: { date: DateISO, montant: MontantFCFA }
}

export type SouscriptionMembre = SouscriptionComplete & SituationSouscription

/** Détail d'un projet vu par le souscripteur (`me.project › get`). */
export type DetailSouscriptionMembre = SouscriptionMembre & {
  echeances: Echeance[]
  /** Paiements déclarés sur ce projet, plus récents d'abord. */
  paiements: Paiement[]
  contrat?: Contrat
}

/** Association du souscripteur et ses projets (`me.assos › list`). */
export interface AssociationMembre {
  association: Association
  /** Date de la première inscription à un projet de l'association. */
  membreDepuis: DateISO
  souscriptions: SouscriptionMembre[]
}

/** Corps de `me.alloc › preview + me.declare › declare`. */
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

/** Tableau de bord gestionnaire (`as.dashboard › get`). */
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

/** Corps de `pr.create › create + pr.lifecycle › publish` (création en 6 étapes). */
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

/** Corps de `as.patch › patch + as.pm › replace` (onboarding étapes 2 et 3, paramètres) ; `logo` : déposé par `as.upload`. */
export type ModificationAssociation = Partial<Pick<Association,
  'nom' | 'description' | 'ville' | 'telephoneContact' | 'emailContact' | 'modalitesPaiement' | 'instructionsPaiement'
>> & { logo?: File }

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

/** Vue d'ensemble d'un projet (`pr.overview › get`). */
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

/** Corps de `en.create › create`. */
export interface NouvelleInscription {
  telephone: string
  /** Compte existant retrouvé : pas de nouveau compte. */
  souscripteurId?: Identifiant
  prenom?: string
  nom?: string
  email?: string
  adresse?: string
  /** Date d'entrée dans le projet : première échéance due (rattrapage des échéances passées compris). */
  dateEntree?: DateISO
}

/** Résultat de `en.create › create` : l'inscription et, pour un compte créé par l'association, le code à remettre. */
export interface InscriptionCreee {
  souscription: SouscriptionAvecSouscripteur
  acces: AccesARemettre | null
}

/** Ligne de « Codes à remettre » (`mb.codes › list`) : compte non activé et dernier code émis par l'association. */
export interface CodeARemettre {
  id: Identifiant
  souscripteur: Souscripteur
  /** `expire` : délai passé ou code remplacé ; `bloque` : trop d'essais. Plus de code à remettre : « Régénérer ». */
  etat: 'valide' | 'expire' | 'bloque'
  /** Code et message prêt, seulement si `etat` = `valide`. */
  acces: AccesARemettre | null
  emisLe: string
  /** Instant ISO du marquage « remis », sinon `null`. */
  remisLe: string | null
}

/** Ligne du tableau des rapports (`rp.report › get`). */
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
}

/** Contrat d'un projet vu par le gestionnaire (`ct.get › get`) : modèle commun et suivi des signatures. */
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

/** Résultat de `fl.upload › create + im.flow › create + im.read › get` (fichier simulé en V0). */
export interface AnalyseImport {
  fichier: string
  nbLignes: number
  colonnes: { colonne: string, exemples: string[], champ: 'prenom' | 'nom' | 'telephone' | 'email' | 'adresse' | null }[]
  compteurs: { pretes: number, comptesExistants: number, erreurs: number, doublons: number }
  /** Lignes à examiner (erreurs, doublons) et exemples de lignes prêtes. */
  lignes: LigneImport[]
}

/** Corps de `pr.patch › patch` (paramètres modifiables après création). */
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

/** `rm.queue › list + rm.rules › list + rm.hist › list` — relances de l'association du gestionnaire. */
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

/** Contrat d'un projet vu depuis la page Contrats (`ct.list › list`) : conditions et suivi des signatures. */
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

// ---------------------------------------------------------------- Équipe, abonnement, profil (gestionnaire)

/** Équipe de l'association (`tm.team › list`). */
export interface EquipeAssociation {
  membres: Gestionnaire[]
  /** Comptes secondaires (hors gestionnaire principal) : utilisés / limite fixée par la plateforme. */
  comptesSecondaires: { utilises: number, limite: number }
}

/** Corps de `tm.team › invite` : le rôle est toujours « secondaire » (MgEquipe). */
export interface InvitationGestionnaire {
  prenom: string
  nom: string
  email: string
  telephone?: string
}

export type StatutAbonnement = 'actif' | 'echeance_proche' | 'suspendu'
export type StatutFactureAbonnement = 'payee' | 'a_payer' | 'impayee'

/** Facture de l'abonnement Cotiz (réglée par l'association à la plateforme). */
export interface FactureAbonnement {
  id: Identifiant
  numero: string // `[N° FACTURE]`
  periode: string // `[PÉRIODE EN COURS]`
  emiseLe: DateISO
  montant: MontantFCFA | '[MONTANT]'
  statut: StatutFactureAbonnement
}

/** Jauge d'utilisation d'un quota. `pourcentage` : remplissage de la barre (la limite peut être un placeholder). */
export interface UtilisationQuota {
  utilise: number
  /** `null` : illimité. */
  limite: Quota
  pourcentage: number
}

/** Abonnement de l'association (`bl.sub › get + bl.inv › list`). */
export interface AbonnementAssociation {
  planId: Identifiant
  nomPlan: string
  prixAnnuel: MontantFCFA | '[PRIX]'
  statut: StatutAbonnement
  clientDepuis: DateISO
  prochaineFacture: DateISO
  /** « Virement ou mobile money à Cotiz ». */
  moyenPaiement: string
  utilisation: { projets: UtilisationQuota, souscripteurs: UtilisationQuota, gestionnaires: UtilisationQuota }
  factures: FactureAbonnement[]
  /** Échéance proche / suspendu : facture à régler et date limite. */
  factureDue?: { numero: string, echeance: DateISO }
  emailContactCotiz: string
  /** « Demander un changement » déjà envoyé. */
  changementDemande: boolean
}

/** Préférences de notification du gestionnaire (MgProfil). Le résumé quotidien par email arrive en V2. */
export interface PreferencesGestionnaire {
  paiementDeclare: boolean
  contratSigne: boolean
  resumeQuotidien: boolean
}

/** Profil du gestionnaire connecté (`me.profile › get + me.prefs › get`). */
export interface ProfilGestionnaire {
  id: Identifiant
  prenom: string
  nom: string
  email: string
  telephone?: string
  role: RoleGestionnaire
  associationNom: string
  motDePasseModifieLe: DateISO
  preferences: PreferencesGestionnaire
}

export type ModificationProfilGestionnaire = Partial<Pick<ProfilGestionnaire, 'prenom' | 'nom' | 'telephone' | 'preferences'>>
