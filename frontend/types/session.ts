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

// ---------------------------------------------------------------- Authentification (écrans publics)

/** Espace visé par un écran de connexion. */
export type EspaceConnexion = Role

/** Corps de `POST /api/session/connexion`. `identifiant` : téléphone (souscripteur) ou email. */
export interface DemandeConnexion {
  espace: EspaceConnexion
  identifiant: string
  motDePasse: string
}

/**
 * Réponse de `POST /api/session/connexion` :
 * - `connecte` : session ouverte ;
 * - `premiere-connexion` : mot de passe provisoire, à remplacer (souscripteur) ;
 * - `code-requis` : second facteur à saisir (plateforme).
 */
export type ResultatConnexion
  = | { etape: 'connecte', role: Role }
    | { etape: 'premiere-connexion', role: Role, prenom: string }
    | { etape: 'code-requis', role: Role }

/** Codes d'erreur métier des écrans d'authentification (`data.code` de la réponse d'erreur). */
export type CodeErreurAuth
  = | 'numero-inconnu'
    | 'mot-de-passe-incorrect'
    | 'identifiants-incorrects'
    | 'compte-suspendu'
    | 'blocage'
    | 'code-incorrect'
    | 'code-expire'

/** Mot de passe oublié : profil d'origine (le champ demandé en dépend). */
export type ProfilMotDePasse = 'souscripteur' | 'gestionnaire'

/** Réponse de `POST /api/mot-de-passe/code`. */
export interface EnvoiCode {
  /** Destination affichée (« +225 05 44 21 87 90 » ou l'email). */
  destination: string
  /** Délai avant de pouvoir renvoyer un code, en secondes. */
  delaiRenvoi: number
}
