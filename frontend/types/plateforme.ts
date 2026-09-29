// Espace plateforme (super-admin) : formes des réponses de l'API propres à cet espace.
// Les chiffres globaux (147 associations, 15 impayés…) sont illustratifs dans la maquette : servis tels quels.
import type { DateISO, Identifiant, MontantFCFA, Quota } from './commun'
import type { Association, TypeAssociation } from './association'
import type { Demande } from './demande'
import type { Plan } from './plan'
import type { StatutProjet } from './projet'
import type { StatutSouscription } from './souscripteur'

/** Pastille d'un événement de frise (Frise). */
export type TonEvenement = 'success' | 'warning' | 'danger' | 'info' | 'brand'

export interface EvenementPlateforme {
  id: Identifiant
  titre: string
  /** Détail affiché sous le titre (« Jeunesse solidaire de Bouaké · 24 sept. »). */
  detail: string
  ton: TonEvenement
}

/** Valeur chiffrée ou placeholder de la maquette (`[N]`, `[MONTANT]`). */
export type ChiffreOuPlaceholder = number | '[N]' | '[MONTANT]'

/** `GET /api/plateforme/tableau-de-bord` (SaDashboard). */
export interface TableauDeBordPlateforme {
  demandesATraiter: number
  /** Les 3 plus anciennes demandes à traiter. */
  demandesPrioritaires: Demande[]
  kpi: {
    associationsActives: number
    nouvellesCeMois: number
    souscripteurs: ChiffreOuPlaceholder
    revenuMensuel: ChiffreOuPlaceholder
    abonnementsAJour: number
    abonnementsImpayes: number
    totalAssociations: number
  }
  /** Associations actives sur 12 mois (données illustratives), du plus ancien au plus récent. */
  evolution: { mois: DateISO, valeur: number }[]
  /** Répartition par plan (données illustratives). */
  repartition: { planId: Identifiant, nom: string, nombre: number }[]
  aSurveiller: AssociationASurveiller[]
  activite: EvenementPlateforme[]
}

export type SignalAssociation = 'impaye' | 'onboarding' | 'quota'

export interface AssociationASurveiller {
  associationId: Identifiant
  nom: string
  signal: SignalAssociation
  /** `null` : sans date (« — »). */
  depuis: DateISO | null
}

/** Événement de la frise d'une demande (reçue, consultée, décision). */
export interface EvenementDemande {
  id: Identifiant
  titre: string
  date: DateISO
  /** Complément après la date (« par Richy · plan Essentiel »). */
  detail?: string
  ton: TonEvenement
}

/** `GET /api/demandes/:id` : la demande et sa frise. */
export type DemandeDetaillee = Demande & { historique: EvenementDemande[] }

/** Corps de `POST /api/demandes/:id/approbation`. */
export interface ApprobationDemande {
  planId: Identifiant
  comptesGestionnaires: number
  debutAbonnement: DateISO
  noteInterne?: string
  messagePersonnalise?: string
}

/** Corps de `POST /api/demandes/:id/refus`. */
export interface RefusDemande {
  motif: string
  precisions?: string
}

/** Ligne de la liste des associations (SaAssociations). */
export type AssociationListe = Association & {
  planNom: string
  /** Dernière activité (date ISO ou libellé relatif de la maquette). */
  derniereActivite: DateISO
}

/** Compteurs des puces de SaAssociations (illustratifs : 147 au total). */
export interface CompteursAssociations {
  toutes: number
  active: number
  impayee: number
  suspendue: number
  onboarding: number
}

/** `GET /api/associations` côté plateforme. */
export interface ListeAssociations {
  associations: AssociationListe[]
  compteurs: CompteursAssociations
}

export interface QuotaUtilise {
  utilise: number
  limite: Quota
  /** Largeur de la barre (%) : calculée si la limite est connue, sinon celle de la maquette. */
  pourcentage: number
}

/** `GET /api/associations/:id/fiche` (SaAssociation). */
export interface FicheAssociationPlateforme {
  association: Association
  plan: Plan
  contact: { nom: string, initiales: string, role: string, email: string, telephone: string }
  kpi: { projetsActifs: number, souscripteurs: number, collecteCumule: ChiffreOuPlaceholder, tauxRecouvrement: number | '[N]' | null }
  abonnement: { prixMensuel: MontantFCFA | '[PRIX]', prochaineEcheance: DateISO }
  quotas: { projets: QuotaUtilise, souscripteurs: QuotaUtilise, gestionnaires: QuotaUtilise }
  evenements: EvenementPlateforme[]
  projets: { id: Identifiant, nom: string, statut: StatutProjet | null, souscripteurs: string, collecte: string, creeLe: string }[]
  souscripteurs: { id: Identifiant, nom: string, telephone: string, projets: string, statut: StatutSouscription | null }[]
  factures: { id: Identifiant, periode: string, montant: MontantFCFA | '[PRIX]', statut: StatutFacture }[]
  /** Abonnement impayé : date de l'impayé et de la suspension prévue. */
  impaye?: { depuis: DateISO, suspensionLe: DateISO }
  suspendueLe?: DateISO
}

/** Corps de `POST /api/associations` (création directe). */
export interface NouvelleAssociationPlateforme {
  association: { nom: string, type: TypeAssociation, numeroEnregistrement?: string, ville: string, pays: string, description?: string }
  gestionnaire: { prenom: string, nom: string, email: string, telephone: string }
  abonnement: { planId: Identifiant, debut: DateISO, comptesGestionnaires: number, essaiJours: number | null }
  envoyerIdentifiants: boolean
}

/** Corps de `POST /api/associations/:id/suspension`. */
export interface SuspensionAssociation {
  motif: string
}

/** Corps de `POST /api/plans` et `PATCH /api/plans/:id`. */
export type ModificationPlan = Pick<Plan, 'nom' | 'description' | 'prixMensuel' | 'prixAnnuel' | 'quotas' | 'fonctionnalites' | 'misEnAvant' | 'statut'>

// ---------------------------------------------------------------- V2 (aperçus)
export type StatutFacture = 'a_venir' | 'en_attente' | 'payee' | 'impayee'

export interface FacturePlateforme {
  id: Identifiant
  numero: string
  associationId: Identifiant
  associationNom: string
  periode: DateISO
  montant: MontantFCFA | '[PRIX]'
  emiseLe: DateISO | null
  echeance: DateISO
  statut: StatutFacture
}

/** `GET /api/plateforme/factures` (aperçu V2). */
export interface FacturationPlateforme {
  kpi: { revenuMois: ChiffreOuPlaceholder, abonnements: number, encaisse: ChiffreOuPlaceholder, facturesPayees: number, enAttente: ChiffreOuPlaceholder, impaye: ChiffreOuPlaceholder, associationsImpayees: number }
  factures: FacturePlateforme[]
}

export type RolePlateforme = 'proprietaire' | 'administrateur' | 'support'

/** `GET /api/plateforme/utilisateurs` (aperçu V2). */
export interface UtilisateurPlateforme {
  id: Identifiant
  nom: string
  email: string
  role: RolePlateforme
  /** `null` : jamais connecté ; placeholder `[date]` de la maquette. */
  derniereConnexion: DateISO | null
  statut: 'actif' | 'invite'
}

/** `GET /api/plateforme/profil` (SaProfil). */
export interface ProfilPlateforme {
  prenom: string
  nom: string
  email: string
  role: RolePlateforme
  preferences: { nouvelleDemande: boolean, abonnementImpaye: boolean, nouvelleAssociation: boolean, resumeHebdomadaire: boolean }
}

export type ModificationProfilPlateforme = Partial<Pick<ProfilPlateforme, 'prenom' | 'nom' | 'email' | 'preferences'>>
