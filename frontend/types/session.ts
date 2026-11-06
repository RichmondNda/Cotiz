import type { Feature, Permission } from '@cotiz/contracts'
import type { Identifiant, Role } from './commun'

/** Utilisateur de la session courante (`me › get`). */
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
  /** Associations où la personne est souscriptrice active (`GET /me`), de la plus ancienne inscription à la plus récente. */
  associationsSouscrites: { id: Identifiant, nom: string }[]
  /** Permissions de l'espace courant (`GET /me`) : le front masque, le back refuse. */
  permissions: Permission[]
  /** Fonctionnalités actives (`GET /me`) : une absente → « Bientôt disponible ». */
  features: Feature[]
}

/** Compteurs des menus, recomposés selon l'espace (`nt.list › unreadCount`, `as.dashboard › get`, `pf.dashboard › get`). */
export interface CompteursNavigation {
  paiementsAValider: number
  notificationsNonLues: number
  /** Gestionnaire : souscripteurs en retard, tous projets (entrée « Relances » du menu Plus). */
  souscripteursEnRetard: number
  demandesATraiter: number
  /** Super-admin (owner, admin) : demandes de réinitialisation des gestionnaires en attente. */
  reinitialisationsATraiter: number
}

// Types d'interface des écrans (lot 0.3) : les échanges suivent @cotiz/contracts, adaptés par composables/api/vues.

// ---------------------------------------------------------------- Authentification (écrans publics)

/** Espace visé par un écran de connexion. */
export type EspaceConnexion = Role

/** Corps de `auth.login › login`. `identifiant` : téléphone (souscripteur) ou email. */
export interface DemandeConnexion {
  espace: EspaceConnexion
  identifiant: string
  motDePasse: string
}

/**
 * Réponse de `auth.login › login` :
 * - `connecte` : session ouverte ;
 * - `premiere-connexion` : mot de passe provisoire, à remplacer (souscripteur) ;
 * - `code-requis` : second facteur à saisir (plateforme).
 */
export type ResultatConnexion
  = | { etape: 'connecte', role: Role }
    | { etape: 'premiere-connexion', role: Role, prenom: string }
    | { etape: 'code-requis', role: Role }

/** Codes d'erreur des écrans d'authentification, traduits depuis le `code` du `Problem` (composables/api/auth.ts). */
export type CodeErreurAuth
  = | 'numero-inconnu'
    | 'mot-de-passe-incorrect'
    | 'identifiants-incorrects'
    | 'compte-suspendu'
    | 'blocage'
    | 'code-incorrect'
    | 'code-expire'
    | 'deja-active'
    | 'mot-de-passe-faible'

/**
 * Mot de passe oublié : profil d'origine (le champ demandé en dépend). `plateforme` : personnel Cotiz, code remis par
 * l'exploitant (CLI reset-password) ; profil non proposé dans le sélecteur, atteint par le lien de la CLI.
 */
export type ProfilMotDePasse = 'souscripteur' | 'gestionnaire' | 'plateforme'

/** Réponse de `auth.forgot › forgot`. */
export interface EnvoiCode {
  /** Destination affichée (« +225 05 44 21 87 90 » ou l'email). */
  destination: string
  /** Délai avant de pouvoir renvoyer un code, en secondes. */
  delaiRenvoi: number
}
