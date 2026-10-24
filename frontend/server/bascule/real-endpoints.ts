// Identifiants de docs/specs/endpoints.yaml servis par le vrai back (NestJS), et pour quels espaces.
// `all` : toute requête de l'endpoint part vers NestJS. Liste d'espaces : seulement les requêtes de ces espaces
// (espace lu dans le jeton Bearer, le corps ou le jeton de réinitialisation : server/bascule/proxy.ts) ; les autres
// restent sur le mock. Ajouter un id = commande /bascule. Tout part vers NestJS quand NUXT_MOCKS=0.
import type { EndpointId } from '@cotiz/contracts'

export type BasculeSpace = 'platform' | 'association' | 'subscriber'
export type BasculeRule = 'all' | readonly BasculeSpace[]

/**
 * Dépôt et lecture de fichiers (fl.*) : espace plateforme seulement. Le logo d'une association passe par as.upload et
 * as.file (décision 24, lot 2.1) ; la preuve d'un souscripteur (lot 3.3) reste simulée avec les écrans qui s'en servent.
 */
const PLATFORM = ['platform'] as const

export const REAL_ENDPOINTS: ReadonlyMap<EndpointId, BasculeRule> = new Map<EndpointId, BasculeRule>([
  ['sys.health', 'all'],
  // Lot 1.1, ouverts aux trois espaces au lot 1.2 (appartenances réelles) : connexion, session et identité.
  ['auth.login', 'all'],
  ['auth.refresh', 'all'],
  ['auth.logout', 'all'],
  ['auth.activate', 'all'],
  ['auth.forgot', 'all'],
  ['auth.verify', 'all'],
  ['auth.reset', 'all'],
  ['me', 'all'],
  ['fl.upload', PLATFORM],
  ['fl.get', PLATFORM],
  // Lot 1.2 : plans (tarifs publics, gestion par le super-admin).
  ['pub.plans', 'all'],
  ['pf.plans', 'all'],
  ['pf.plan.write', 'all'],
  ['pf.plan.archive', 'all'],
  // Lot 1.3 : demandes de création (formulaire public, anti-robot, pages légales), approbation et création directe.
  ['pub.challenge', 'all'],
  ['pub.request', 'all'],
  ['pub.legal', 'all'],
  ['pf.req.list', 'all'],
  ['pf.req.get', 'all'],
  ['pf.req.approve', 'all'],
  ['pf.req.reject', 'all'],
  ['pf.asso.create', 'all'],
  // Lot 1.4 : liste, fiche, modification, suspension et changement de plan des associations (super-admin).
  ['pf.asso.list', 'all'],
  ['pf.asso.get', 'all'],
  ['pf.asso.patch', 'all'],
  ['pf.asso.suspend', 'all'],
  ['pf.asso.plan', 'all'],
  // Lot 1.4 : demandes de réinitialisation des gestionnaires (écran ajouté, sans mock).
  ['pf.resets', 'all'],
  // Lot 1.4 : tableau de bord plateforme (vues matérialisées, tâche stats.refresh).
  ['pf.dashboard', 'all'],
  // Lot 2.1 : profil, logo, moyens de paiement, onboarding et abonnement de l'association (espace gestionnaire).
  ['as.get', 'all'],
  ['as.patch', 'all'],
  ['as.upload', 'all'],
  ['as.file', 'all'],
  ['as.pm', 'all'],
  ['as.onb', 'all'],
  ['bl.sub', 'all'],
])
