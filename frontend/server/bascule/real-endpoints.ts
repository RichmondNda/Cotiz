// Identifiants de docs/specs/endpoints.yaml servis par le vrai back (NestJS).
// Ajouter un id = les requêtes de cet endpoint partent vers NestJS au lieu du mock (commande /bascule).
// Tout part vers NestJS quand NUXT_MOCKS=0 (build de production, recette).
import type { EndpointId } from '@cotiz/contracts'

export const REAL_ENDPOINTS = new Set<EndpointId>([
  'sys.health',
  // lot 1.1 : 'auth.login', 'auth.refresh', 'auth.logout', 'me', …
])
