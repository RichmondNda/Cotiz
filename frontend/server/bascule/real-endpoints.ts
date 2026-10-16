// Identifiants de docs/specs/endpoints.yaml servis par le vrai back (NestJS), et pour quels espaces.
// `all` : toute requête de l'endpoint part vers NestJS. Liste d'espaces : seulement les requêtes de ces espaces
// (espace lu dans le jeton Bearer, le corps ou le jeton de réinitialisation : server/bascule/proxy.ts) ; les autres
// restent sur le mock. Ajouter un id = commande /bascule. Tout part vers NestJS quand NUXT_MOCKS=0.
import type { EndpointId } from '@cotiz/contracts'

export type BasculeSpace = 'platform' | 'association' | 'subscriber'
export type BasculeRule = 'all' | readonly BasculeSpace[]

/** Lot 1.1 : espace plateforme seulement ; gestionnaire et souscripteur au lot 1.2. */
const PLATFORM = ['platform'] as const

export const REAL_ENDPOINTS: ReadonlyMap<EndpointId, BasculeRule> = new Map<EndpointId, BasculeRule>([
  ['sys.health', 'all'],
  ['auth.login', PLATFORM],
  ['auth.refresh', PLATFORM],
  ['auth.logout', PLATFORM],
  ['auth.activate', PLATFORM],
  ['auth.forgot', PLATFORM],
  ['auth.verify', PLATFORM],
  ['auth.reset', PLATFORM],
  ['me', PLATFORM],
  ['fl.upload', PLATFORM],
  ['fl.get', PLATFORM],
])
