import type { Identifiant, Role } from './commun'

/** Utilisateur de la session courante (`/api/session/moi`). */
export interface UtilisateurSession {
  id: Identifiant
  role: Role
  prenom: string
  nom?: string
  /** Libellé sous le nom (« Souscripteur », « Trésorière »). */
  fonction?: string
  /** Gestionnaire : association courante (carte en tête de la barre latérale). */
  associationId?: Identifiant
  association?: { id: Identifiant, nom: string, sigle?: string, plan: string }
}

/** Compteurs des menus (`/api/navigation/compteurs`). */
export interface CompteursNavigation {
  paiementsAValider: number
  notificationsNonLues: number
  demandesATraiter: number
}
