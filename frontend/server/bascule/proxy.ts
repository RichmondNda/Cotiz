// Décision de bascule d'une requête `/api/v1/**` : servie par le mock Nitro ou transmise à NestJS (même origine pour
// le navigateur : pas de CORS, cookies d'authentification sur le domaine du front). docs/architecture/10-front-integration.md.
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { getRequestHeader, getRequestURL, proxyRequest, setResponseHeader } from 'h3'
import { REAL_ENDPOINTS } from './real-endpoints'
import { resolveEndpoint } from './resolve'

export interface BasculeConfig {
  /** `false` (NUXT_MOCKS=0) : toutes les requêtes `/api/v1` partent vers NestJS. */
  mocks: boolean
  /** Origine de l'api NestJS (NUXT_API_ORIGIN), `http://localhost:4000` en local. */
  apiOrigin: string
  real?: ReadonlySet<string>
}

export type Decision = 'proxy' | 'mock'

export function decide(method: string, path: string, config: BasculeConfig): Decision {
  if (!config.mocks) return 'proxy'
  const endpoint = resolveEndpoint(method, path)
  return endpoint && (config.real ?? REAL_ENDPOINTS).has(endpoint.id) ? 'proxy' : 'mock'
}

/** Même règle que NestJS (request-info.middleware.ts) : court, sans espace ni caractère de contrôle. */
const REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

/**
 * Middleware : rien pour un chemin hors `/api/v1` ; servi par le mock, la réponse porte un `X-Request-Id` comme celles
 * de NestJS (rapports d'erreur du front) ; sinon proxy vers NestJS, qui pose le sien.
 */
export async function bascule(event: H3Event, config: BasculeConfig) {
  const url = getRequestURL(event)
  if (!url.pathname.startsWith('/api/v1/')) return
  if (decide(event.method, url.pathname, config) === 'mock') {
    const requested = getRequestHeader(event, 'x-request-id')
    setResponseHeader(event, 'X-Request-Id', requested && REQUEST_ID.test(requested) ? requested : randomUUID())
    return
  }
  return proxyRequest(event, `${config.apiOrigin.replace(/\/$/, '')}${url.pathname}${url.search}`)
}
