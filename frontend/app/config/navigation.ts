// Menus de chaque espace, construits à partir de cette configuration (barres latérales, navigations basses).
// `compteur` : clé des compteurs de navigation servis par l'API (`/api/navigation/compteurs`).
import type { NomIcone } from '~/utils/icons'

export type CleCompteur = 'paiementsAValider' | 'notificationsNonLues' | 'demandesATraiter'

export interface EntreeNavigation {
  cle: string
  label: string
  to: string
  icone: NomIcone
  compteur?: CleCompteur
  /** Ton du compteur : warning (action en attente, défaut) ou danger (non lues). */
  tonCompteur?: 'warning' | 'danger'
  /** Actif aussi sur les sous-routes (défaut) ; `exact` pour les accueils. */
  exact?: boolean
  /** Entrée d'action (déconnexion) plutôt qu'un lien. */
  action?: 'deconnexion'
}

export const NAV_GESTIONNAIRE: { principal: EntreeNavigation[], bas: EntreeNavigation[] } = {
  principal: [
    { cle: 'dashboard', label: 'Tableau de bord', to: '/asso', icone: 'tableau-de-bord', exact: true },
    { cle: 'projets', label: 'Projets', to: '/asso/projets', icone: 'projet' },
    { cle: 'souscripteurs', label: 'Souscripteurs', to: '/asso/souscripteurs', icone: 'souscripteurs' },
    { cle: 'paiements', label: 'Paiements', to: '/asso/paiements', icone: 'paiement', compteur: 'paiementsAValider' },
    { cle: 'relances', label: 'Relances', to: '/asso/relances', icone: 'relance' },
    { cle: 'contrats', label: 'Contrats', to: '/asso/contrats', icone: 'contrat' },
  ],
  bas: [
    { cle: 'equipe', label: 'Équipe', to: '/asso/equipe', icone: 'profil' },
    { cle: 'abonnement', label: 'Abonnement', to: '/asso/abonnement', icone: 'facturation' },
    { cle: 'parametres', label: 'Paramètres', to: '/asso/parametres', icone: 'parametres' },
  ],
}

/** Navigation basse mobile du gestionnaire : 5 entrées. */
export const NAV_GESTIONNAIRE_MOBILE: EntreeNavigation[] = [
  { cle: 'accueil', label: 'Accueil', to: '/asso', icone: 'tableau-de-bord', exact: true },
  { cle: 'projets', label: 'Projets', to: '/asso/projets', icone: 'projet' },
  { cle: 'paiements', label: 'Paiements', to: '/asso/paiements', icone: 'paiement', compteur: 'paiementsAValider', tonCompteur: 'danger' },
  { cle: 'membres', label: 'Membres', to: '/asso/souscripteurs', icone: 'souscripteurs' },
  { cle: 'plus', label: 'Plus', to: '/asso/plus', icone: 'menu' },
]

export const NAV_PLATEFORME: { principal: EntreeNavigation[], bas: EntreeNavigation[] } = {
  principal: [
    { cle: 'dashboard', label: 'Tableau de bord', to: '/plateforme', icone: 'tableau-de-bord', exact: true },
    { cle: 'demandes', label: 'Demandes', to: '/plateforme/demandes', icone: 'contrat', compteur: 'demandesATraiter' },
    { cle: 'associations', label: 'Associations', to: '/plateforme/associations', icone: 'association' },
    { cle: 'plans', label: 'Plans', to: '/plateforme/plans', icone: 'plans' },
    { cle: 'facturation', label: 'Facturation', to: '/plateforme/facturation', icone: 'facturation' },
    { cle: 'utilisateurs', label: 'Utilisateurs', to: '/plateforme/utilisateurs', icone: 'souscripteurs' },
  ],
  bas: [
    { cle: 'profil', label: 'Mon profil', to: '/plateforme/profil', icone: 'profil' },
    { cle: 'deconnexion', label: 'Se déconnecter', to: '/connexion/plateforme', icone: 'deconnexion', action: 'deconnexion' },
  ],
}

/** Souscripteur : navigation basse 4 entrées (mobile) ; barre latérale + Notifications (desktop). */
export const NAV_SOUSCRIPTEUR: EntreeNavigation[] = [
  { cle: 'accueil', label: 'Accueil', to: '/accueil', icone: 'accueil' },
  // « Projets » ouvre la liste des associations et de leurs projets (MbNav → MbAssociations).
  { cle: 'projets', label: 'Projets', to: '/associations', icone: 'projet' },
  { cle: 'historique', label: 'Historique', to: '/historique', icone: 'historique' },
  { cle: 'profil', label: 'Profil', to: '/profil', icone: 'profil' },
]

export const NAV_SOUSCRIPTEUR_NOTIFICATIONS: EntreeNavigation = {
  cle: 'notifications', label: 'Notifications', to: '/notifications', icone: 'notification', compteur: 'notificationsNonLues', tonCompteur: 'danger',
}

/** Une entrée est-elle active pour le chemin courant ? */
export function estEntreeActive(e: EntreeNavigation, chemin: string): boolean {
  const c = chemin.replace(/\/$/, '') || '/'
  if (e.exact) return c === e.to
  return c === e.to || c.startsWith(`${e.to}/`)
}
