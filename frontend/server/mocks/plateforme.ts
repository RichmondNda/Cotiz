// Données de l'espace plateforme (super-admin) : valeurs affichées dans les maquettes Sa*.dc.html (blocs renderVals()).
// Chiffres globaux illustratifs (147 associations, 15 impayés…) et placeholders (`[N]`, `[MONTANT]`, `[PRIX]`) conservés.
import type {
  AssociationASurveiller,
  CompteursAssociations,
  EvenementPlateforme,
  FacturePlateforme,
  FicheAssociationPlateforme,
  ProfilPlateforme,
  UtilisateurPlateforme,
} from '~~/types'

// ---------------------------------------------------------------- Tableau de bord (SaDashboard)
export const KPI_PLATEFORME = {
  associationsActives: 147,
  nouvellesCeMois: 6,
  souscripteurs: '[N]' as const,
  revenuMensuel: '[MONTANT]' as const,
  abonnementsAJour: 132,
  abonnementsImpayes: 15,
  totalAssociations: 147,
}

/** Associations actives sur 12 mois (octobre 2025 → septembre 2026), « données illustratives » : de 98 à 147. */
export const EVOLUTION_ASSOCIATIONS = [98, 102, 105, 110, 114, 120, 124, 130, 134, 138, 143, 147]
  .map((valeur, i) => ({ mois: `${i < 3 ? 2025 : 2026}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-01`, valeur }))

export const A_SURVEILLER: AssociationASurveiller[] = [
  { associationId: 'ressortissants-man', nom: 'Association des ressortissants de Man', signal: 'impaye', depuis: '2026-09-05' },
  { associationId: 'jeunesse-bouake', nom: 'Jeunesse solidaire de Bouaké', signal: 'onboarding', depuis: '2026-09-24' },
  { associationId: 'entraide-yopougon', nom: 'Entraide Yopougon', signal: 'quota', depuis: null },
]

export const ACTIVITE_PLATEFORME: EvenementPlateforme[] = [
  { id: 'ac-1', titre: 'Nouvelle association', detail: 'Jeunesse solidaire de Bouaké · 24 sept.', ton: 'info' },
  { id: 'ac-2', titre: 'Abonnement impayé', detail: 'Assoc. des ressortissants de Man · 5 sept.', ton: 'warning' },
  { id: 'ac-3', titre: 'Changement de plan', detail: 'Entraide Yopougon · Découverte → Essentiel', ton: 'brand' },
  { id: 'ac-4', titre: 'Demande approuvée', detail: 'Jeunesse solidaire de Bouaké · par Richy', ton: 'success' },
]

// ---------------------------------------------------------------- Associations (SaAssociations, SaAssociation)
/** Compteurs des puces (illustratifs : la liste ne détaille que 3 associations de démonstration). */
// `toutes` est recalculé par GET /api/associations (somme des statuts).
export const COMPTEURS_ASSOCIATIONS: CompteursAssociations = { toutes: 148, active: 132, impayee: 15, suspendue: 0, onboarding: 1 }

/** Dernière activité de chaque association (colonne « Dernière activité »). */
export const DERNIERE_ACTIVITE: Record<string, string> = {
  'entraide-yopougon': '2026-09-25',
  'ressortissants-man': '2026-09-23',
  'jeunesse-bouake': '2026-09-24',
}

/**
 * Initiales affichées dans l'espace plateforme quand elles diffèrent du sigle de l'association :
 * la maquette super-admin écrit « AR » pour les ressortissants de Man, l'espace souscripteur « RM ».
 */
export const INITIALES_PLATEFORME: Record<string, string> = { 'ressortissants-man': 'AR' }

type DetailFiche = Omit<FicheAssociationPlateforme, 'association' | 'plan' | 'abonnement'>

/** Détail des 3 associations de référence (SaAssociation). Largeurs des barres de quota reprises de la maquette. */
export const FICHES_ASSOCIATIONS: Record<string, DetailFiche> = {
  'entraide-yopougon': {
    contact: { nom: 'Awa Koné', initiales: 'AK', role: 'Gestionnaire principale · trésorière', email: 'awa@entraide.ci', telephone: '+225 07 08 09 10 11' },
    kpi: { projetsActifs: 3, souscripteurs: 52, collecteCumule: '[MONTANT]', tauxRecouvrement: 82 },
    quotas: {
      projets: { utilise: 3, limite: '[N]', pourcentage: 60 },
      souscripteurs: { utilise: 52, limite: '[N]', pourcentage: 52 },
      gestionnaires: { utilise: 2, limite: '[N]', pourcentage: 66 },
    },
    evenements: [
      { id: 'ev-1', titre: 'Changement de plan', detail: 'Découverte → Essentiel', ton: 'brand' },
      { id: 'ev-2', titre: 'Gestionnaire ajoutée', detail: 'Aminata Konaté', ton: 'success' },
      { id: 'ev-3', titre: 'Espace créé', detail: 'Février 2024', ton: 'info' },
    ],
    projets: [
      { id: 'centre-communautaire', nom: 'Centre communautaire', statut: 'en_cours', souscripteurs: '52', collecte: '9 594 000 F', creeLe: 'Mars 2026' },
      { id: 'tontine-solidaire-2027', nom: 'Tontine solidaire 2027', statut: 'inscriptions_ouvertes', souscripteurs: '12 / 30', collecte: '—', creeLe: '[DATE]' },
      { id: 'voyage-solidaire', nom: 'Voyage solidaire', statut: 'en_cours', souscripteurs: '[N]', collecte: '[MONTANT] F', creeLe: '[DATE]' },
    ],
    souscripteurs: [
      { id: 'awa-kone', nom: 'Awa Koné', telephone: '+225 07 08 09 10 11', projets: '1', statut: 'a_jour' },
      { id: 'moussa-diarra', nom: 'Moussa Diarra', telephone: '+225 05 44 21 87 90', projets: '2', statut: 'en_retard' },
      { id: 'fatou-traore', nom: 'Fatou Traoré', telephone: '+225 01 22 33 44 55', projets: '1', statut: 'signature_attendue' },
      { id: 'jean-kouassi', nom: 'Jean Kouassi', telephone: '+225 07 55 66 77 88', projets: '1', statut: 'a_jour' },
    ],
    factures: [
      { id: 'fey-09', periode: '2026-09-01', montant: '[PRIX]', statut: 'payee' },
      { id: 'fey-08', periode: '2026-08-01', montant: '[PRIX]', statut: 'payee' },
      { id: 'fey-07', periode: '2026-07-01', montant: '[PRIX]', statut: 'payee' },
    ],
  },
  'ressortissants-man': {
    contact: { nom: '[Responsable]', initiales: '··', role: 'Gestionnaire principal', email: '[email]', telephone: '+225 [XX XX XX XX XX]' },
    kpi: { projetsActifs: 5, souscripteurs: 142, collecteCumule: '[MONTANT]', tauxRecouvrement: '[N]' },
    // Pro : 5 projets, 200 souscripteurs, 3 gestionnaires (barres calculées).
    quotas: {
      projets: { utilise: 5, limite: 5, pourcentage: 100 },
      souscripteurs: { utilise: 142, limite: 200, pourcentage: 71 },
      gestionnaires: { utilise: 2, limite: 3, pourcentage: 67 },
    },
    evenements: [
      { id: 'ev-1', titre: 'Abonnement impayé', detail: '5 sept. 2026', ton: 'warning' },
      { id: 'ev-2', titre: 'Passage au plan Pro', detail: '[DATE]', ton: 'success' },
      { id: 'ev-3', titre: 'Espace créé', detail: 'Janvier 2025', ton: 'info' },
    ],
    projets: [{ id: 'non-detailles', nom: '[5 projets — non détaillés dans les données de référence]', statut: null, souscripteurs: '—', collecte: '—', creeLe: '—' }],
    souscripteurs: [{ id: 'non-detailles', nom: '[142 souscripteurs — non détaillés dans les données de référence]', telephone: '—', projets: '—', statut: null }],
    factures: [
      { id: 'frm-09', periode: '2026-09-01', montant: '[PRIX]', statut: 'impayee' },
      { id: 'frm-08', periode: '2026-08-01', montant: '[PRIX]', statut: 'payee' },
      { id: 'frm-07', periode: '2026-07-01', montant: '[PRIX]', statut: 'payee' },
    ],
    impaye: { depuis: '2026-09-05', suspensionLe: '2026-10-10' },
  },
  'jeunesse-bouake': {
    contact: { nom: '[Responsable]', initiales: '··', role: 'Gestionnaire principal', email: '[email]', telephone: '+225 [XX XX XX XX XX]' },
    kpi: { projetsActifs: 0, souscripteurs: 0, collecteCumule: 0, tauxRecouvrement: null },
    quotas: {
      projets: { utilise: 0, limite: '[N]', pourcentage: 0 },
      souscripteurs: { utilise: 0, limite: '[N]', pourcentage: 0 },
      gestionnaires: { utilise: 1, limite: '[N]', pourcentage: 33 },
    },
    evenements: [
      { id: 'ev-1', titre: 'Onboarding en cours', detail: 'Étape 2 sur 4', ton: 'info' },
      { id: 'ev-2', titre: 'Demande approuvée', detail: '24 sept. 2026 · par Richy', ton: 'success' },
    ],
    projets: [],
    souscripteurs: [],
    factures: [
      { id: 'fjs-10', periode: '2026-10-01', montant: '[PRIX]', statut: 'a_venir' },
    ],
  },
}

/** Prochaine échéance d'abonnement affichée dans la carte « Abonnement » (01/10/2026 pour toutes). */
export const PROCHAINE_ECHEANCE_ABONNEMENT = '2026-10-01'

// ---------------------------------------------------------------- Demande de référence (SaDemande)
/** Valeurs de la capture pour « Tontine des commerçantes d'Adjamé ». */
export const DEMANDE_TONTINE = {
  reference: '[RÉF. DEMANDE]',
  recueLe: '2026-09-21T10:14:00',
  consulteeLe: '2026-09-25T09:02:00',
  description: '[Description de l’activité saisie par le demandeur — 500 caractères maximum.]',
  fonction: 'Présidente',
  telephone: '+225 07 [XX XX XX XX]',
  projetsEnvisages: '2 à 3',
  source: 'Une autre association',
}

// ---------------------------------------------------------------- Facturation (V2, aperçu)
export const KPI_FACTURATION = {
  revenuMois: '[MONTANT]' as const, abonnements: 147, encaisse: '[MONTANT]' as const, facturesPayees: 132,
  enAttente: '[MONTANT]' as const, impaye: '[MONTANT]' as const, associationsImpayees: 15,
}

export const FACTURES_PLATEFORME: FacturePlateforme[] = [
  { id: 'f-0112', numero: 'F-2026-09-0112', associationId: 'ressortissants-man', associationNom: 'Association des ressortissants de Man', periode: '2026-09-01', montant: '[PRIX]', emiseLe: '2026-09-01', echeance: '2026-09-05', statut: 'impayee' },
  { id: 'f-0087', numero: 'F-2026-09-0087', associationId: 'entraide-yopougon', associationNom: 'Entraide Yopougon', periode: '2026-09-01', montant: '[PRIX]', emiseLe: '2026-09-01', echeance: '2026-09-05', statut: 'payee' },
  { id: 'f-0001', numero: 'F-2026-10-0001', associationId: 'jeunesse-bouake', associationNom: 'Jeunesse solidaire de Bouaké', periode: '2026-10-01', montant: '[PRIX]', emiseLe: null, echeance: '2026-10-05', statut: 'a_venir' },
  { id: 'f-0002', numero: 'F-2026-10-0002', associationId: 'entraide-yopougon', associationNom: 'Entraide Yopougon', periode: '2026-10-01', montant: '[PRIX]', emiseLe: '2026-09-25', echeance: '2026-10-05', statut: 'en_attente' },
]

// ---------------------------------------------------------------- Utilisateurs (V2, aperçu) et profil
export const UTILISATEURS_PLATEFORME: UtilisateurPlateforme[] = [
  { id: 'richy', nom: 'Richy', email: '[email]', role: 'proprietaire', derniereConnexion: '2026-09-25T09:02:00', statut: 'actif' },
  { id: 'membre-1', nom: '[Membre de l’équipe]', email: '[email]', role: 'administrateur', derniereConnexion: '[date]', statut: 'actif' },
  { id: 'membre-2', nom: '[Membre de l’équipe]', email: '[email]', role: 'support', derniereConnexion: null, statut: 'invite' },
]

export const PROFIL_RICHY: ProfilPlateforme = {
  prenom: 'Richy',
  nom: '[Nom]',
  email: '[email]',
  role: 'proprietaire',
  preferences: { nouvelleDemande: true, abonnementImpaye: true, nouvelleAssociation: false, resumeHebdomadaire: true },
}
