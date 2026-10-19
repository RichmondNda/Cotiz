// Décision de bascule d'une requête `/api/v1/**` : servie par le mock Nitro ou transmise à NestJS (même origine pour
// le navigateur : pas de CORS, cookies d'authentification sur le domaine du front). docs/architecture/10-front-integration.md.
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { getCookie, getRequestHeader, getRequestURL, proxyRequest, readRawBody, setResponseHeader } from 'h3'
import { REAL_ENDPOINTS } from './real-endpoints'
import { resolveEndpoint } from './resolve'

export interface BasculeConfig {
  /** `false` (NUXT_MOCKS=0) : toutes les requêtes `/api/v1` partent vers NestJS. */
  mocks: boolean
  /** Origine de l'api NestJS (NUXT_API_ORIGIN), `http://localhost:4000` en local. */
  apiOrigin: string
  /** Registre : un Set vaut « tous les espaces » ; une Map donne `all` ou les espaces basculés de chaque id. */
  real?: ReadonlySet<string> | ReadonlyMap<string, 'all' | readonly string[]>
}

/** Ce que la requête dit de son espace (jamais une preuve : NestJS vérifie tout). */
export interface RequestSpace {
  space?: string
  /** Cookie de renouvellement présent : seul NestJS le pose (une session réelle existe). */
  refreshCookie?: boolean
}

export type Decision = 'proxy' | 'mock'

const SPACES = new Set(['platform', 'association', 'subscriber'])

/** Cookie du jeton de renouvellement de NestJS (backend : refresh-cookie.ts). */
const REFRESH_COOKIE = 'cotiz_refresh'

function ruleOf(config: BasculeConfig, id: string): 'all' | readonly string[] | undefined {
  const real = config.real ?? REAL_ENDPOINTS
  if (real instanceof Map) return real.get(id)
  return (real as ReadonlySet<string>).has(id) ? 'all' : undefined
}

export function decide(method: string, path: string, config: BasculeConfig, request: RequestSpace = {}): Decision {
  if (!config.mocks) return 'proxy'
  const endpoint = resolveEndpoint(method, path)
  const rule = endpoint ? ruleOf(config, endpoint.id) : undefined
  if (!endpoint || !rule) return 'mock'
  if (rule === 'all') return 'proxy'
  if (request.space && rule.includes(request.space)) return 'proxy'
  return endpoint.id === 'auth.refresh' && request.refreshCookie ? 'proxy' : 'mock'
}

/** Claim `space` d'un JWT (Bearer ou jeton de réinitialisation), lu sans vérification : seulement pour aiguiller. */
export function spaceOfToken(token: string): string | undefined {
  const payload = token.split('.')[1]
  if (!payload) return undefined
  try {
    const space = (JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { space?: unknown }).space
    return typeof space === 'string' && SPACES.has(space) ? space : undefined
  }
  catch {
    return undefined
  }
}

/**
 * Endpoints qui disent leur espace dans le corps (`space`, ou claim du `resetToken`) : le corps l'emporte sur un
 * Bearer d'une autre session de l'onglet (connexion à un autre espace, mot de passe oublié…).
 */
const BODY_SPACE = new Set(['auth.login', 'auth.activate', 'auth.forgot', 'auth.verify', 'auth.reset'])

/** Espace de la requête : corps JSON pour BODY_SPACE, sinon jeton Bearer ; cookie de renouvellement. */
async function requestSpace(event: H3Event, id: string): Promise<RequestSpace> {
  const refreshCookie = Boolean(getCookie(event, REFRESH_COOKIE))
  const bearer = /^Bearer (\S+)$/i.exec(getRequestHeader(event, 'authorization') ?? '')?.[1]
  if (!BODY_SPACE.has(id)) return { space: bearer ? spaceOfToken(bearer) : undefined, refreshCookie }
  if (event.method !== 'POST') return { refreshCookie }
  // Corps lu une fois et gardé par h3 : le mock ou le proxy le relisent tel quel.
  const raw = await readRawBody(event, 'utf8').catch(() => undefined)
  try {
    const body = raw ? (JSON.parse(raw) as { space?: unknown, resetToken?: unknown }) : {}
    if (typeof body.space === 'string') return { space: body.space, refreshCookie }
    if (typeof body.resetToken === 'string') return { space: spaceOfToken(body.resetToken), refreshCookie }
  }
  catch {
    // Corps illisible : l'espace reste inconnu (mock), le handler répondra validation_failed.
  }
  return { refreshCookie }
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
  const endpoint = resolveEndpoint(event.method, url.pathname)
  const rule = endpoint ? ruleOf(config, endpoint.id) : undefined
  // L'espace n'est lu (corps compris) que pour un endpoint basculé par espace.
  const request = config.mocks && endpoint && Array.isArray(rule) ? await requestSpace(event, endpoint.id) : {}
  if (decide(event.method, url.pathname, config, request) === 'mock') {
    const requested = getRequestHeader(event, 'x-request-id')
    setResponseHeader(event, 'X-Request-Id', requested && REQUEST_ID.test(requested) ? requested : randomUUID())
    return
  }
  return proxyRequest(event, `${config.apiOrigin.replace(/\/$/, '')}${url.pathname}${url.search}`)
}
