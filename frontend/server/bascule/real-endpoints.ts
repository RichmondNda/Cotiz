// Identifiants de docs/specs/endpoints.yaml servis par le vrai back (NestJS), et pour quels espaces.
// `all` : toute requête de l'endpoint part vers NestJS. Liste d'espaces : seulement les requêtes de ces espaces
// (espace lu dans le jeton Bearer, le corps ou le jeton de réinitialisation : server/bascule/proxy.ts) ; les autres
// restent sur le mock. Ajouter un id = commande /bascule. Tout part vers NestJS quand NUXT_MOCKS=0.
import type { EndpointId } from '@cotiz/contracts'

export type BasculeSpace = 'platform' | 'association' | 'subscriber'
export type BasculeRule = 'all' | readonly BasculeSpace[]

/**
 * Dépôt et lecture de fichiers : espace plateforme seulement. Le dépôt d'un logo d'association (décision 24, lot 2.1)
 * et de la preuve d'un souscripteur (lot 3.3) restent simulés avec les écrans qui s'en servent.
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
])
