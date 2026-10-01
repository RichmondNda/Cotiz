// Enveloppe des handlers simulés `/api/v1` : un handler par opération du registre de @cotiz/contracts.
// - entrées validées par les schémas du contrat (`validation_failed` sinon) ;
// - session mockée (cookie `cotiz_role`) et contrôle de l'espace (`forbidden`, ressource d'une autre association → 404) ;
// - scénarios de dev (`x-cotiz-scenario` ou `?scenario=`) : `erreur`, `chargement`, états de données, erreurs du § 4 de
//   docs/specs/v0-mapping.md ;
// - réponse contrôlée par son schéma : un mock non conforme échoue bruyamment (500) au lieu de tromper le front.
// Les implémentations sont aussi enregistrées dans IMPLEMENTATIONS : le test de conformité les appelle sans serveur.
import { ENDPOINTS, ERRORS } from '@cotiz/contracts'
import type { EndpointDef, ErrorCode, OperationDef } from '@cotiz/contracts'
import type { EndpointKey, OperationName } from '@cotiz/api-client'
import type { H3Event } from 'h3'
import { defineEventHandler, getCookie, getHeader, getQuery, getRequestURL, getRouterParams, readBody, setResponseHeader, setResponseStatus } from 'h3'
import type { z } from 'zod'
import { db } from './db'
import type { ManagerRole } from './db'
import { ID } from './ids'
import { withScenario } from './scenarios'

// ---------------------------------------------------------------- Erreurs du catalogue

export class ProblemError extends Error {
  constructor(readonly code: ErrorCode, readonly extra: Record<string, unknown> = {}, readonly detail?: string) {
    super(code)
  }
}

/** Erreur `Problem` du catalogue docs/specs/errors.yaml (statut HTTP et titre du catalogue). */
export function problem(code: ErrorCode, extra: Record<string, unknown> = {}, detail?: string): never {
  throw new ProblemError(code, extra, detail)
}

export function problemBody(e: ProblemError) {
  const { http, message } = ERRORS[e.code]
  return { type: `https://cotiz.app/errors/${e.code}`, title: message, status: http, code: e.code, ...(e.detail ? { detail: e.detail } : {}), ...e.extra }
}

// ---------------------------------------------------------------- Session mockée

export type Space = 'platform' | 'association' | 'subscriber'
export interface MockSession {
  space: Space
  userId: string
  /** Association courante (gestionnaire) ; `null` ailleurs. */
  associationId: string | null
  role: ManagerRole | null
}

/** Cookie V0 `cotiz_role` → personne des maquettes (Moussa Diarra, Awa Koné, Richy). */
export const ROLE_TO_SPACE = { souscripteur: 'subscriber', gestionnaire: 'association', superadmin: 'platform' } as const
export const SPACE_TO_ROLE = { subscriber: 'souscripteur', association: 'gestionnaire', platform: 'superadmin' } as const

export function sessionFromRole(role: string | undefined): MockSession | null {
  switch (role) {
    case 'souscripteur': return { space: 'subscriber', userId: ID.moussa, associationId: null, role: null }
    case 'gestionnaire': return { space: 'association', userId: ID.awa, associationId: ID.entraide, role: 'owner' }
    case 'superadmin': return { space: 'platform', userId: ID.richy, associationId: null, role: null }
    default: return null
  }
}

// ---------------------------------------------------------------- Contexte d'une requête

type Op<I extends EndpointKey, N extends OperationName<I>> = (typeof ENDPOINTS)[I]['operations'][N]
type Req<I extends EndpointKey, N extends OperationName<I>> = Op<I, N> extends { request: infer R } ? R : never
type Parsed<R, K extends string> = R extends Record<K, infer S extends z.ZodType> ? z.output<S> : undefined
type Out<I extends EndpointKey, N extends OperationName<I>> = Op<I, N> extends { response: { body: infer B extends z.ZodType } } ? z.input<B> : null

export interface MockContext<I extends EndpointKey, N extends OperationName<I>> {
  params: Parsed<Req<I, N>, 'params'>
  query: Parsed<Req<I, N>, 'query'>
  body: Parsed<Req<I, N>, 'body'>
  session: MockSession | null
  scenario: string | undefined
  /** `If-Match: W/"<version>"` ; `null` si absent. */
  ifMatch: number | null
  idempotencyKey: string | null
  /** Pose le cookie de session mockée (connexion) ; sans effet dans les tests. */
  setRole?: (role: string | null) => void
  /** Origine de la requête (URL de dépôt simulée). */
  origin?: string
}

export type MockImpl<I extends EndpointKey, N extends OperationName<I>> = (ctx: MockContext<I, N>) => Out<I, N> | Promise<Out<I, N>>

interface Registered { id: EndpointKey, op: string, impl: (ctx: MockContext<never, never>) => unknown }
export const IMPLEMENTATIONS = new Map<string, Registered>()

function definition(id: EndpointKey, op: string): { def: EndpointDef, operation: OperationDef } {
  const def = ENDPOINTS[id] as EndpointDef
  const operation = def.operations[op]
  if (!operation) throw new Error(`Opération inconnue : ${id}.${op}`)
  return { def, operation }
}

function parseOr422(schema: z.ZodType | undefined, value: unknown) {
  if (!schema) return undefined
  const result = schema.safeParse(value)
  if (result.success) return result.data
  const fields = Object.fromEntries(result.error.issues.map(i => [i.path.join('.') || '_', i.message]))
  problem('validation_failed', { fields })
}

/** Contrôle d'accès de l'espace de l'endpoint (permissions.yaml simplifiées pour la session mockée). */
function authorize(def: EndpointDef, session: MockSession | null, params: Record<string, unknown> | undefined) {
  if (def.permission === 'public') return
  if (!session) throw new ProblemError('session_expired')
  if (def.space === 'platform' && session.space !== 'platform') problem('forbidden')
  if (def.space === 'association') {
    if (session.space !== 'association') problem('forbidden')
    // Ressource d'une autre association : 404, jamais 403 (règle n° 4).
    if (params && 'aid' in params && params.aid !== session.associationId) problem('not_found')
  }
  if (def.permission === 'subscriber.self' && session.space !== 'subscriber') problem('forbidden')
}

const MUTATION_ERRORS: ErrorCode[] = ['allocation_mismatch', 'quota_exceeded', 'payment_already_reviewed']

/** Erreurs déclenchables par scénario (docs/specs/v0-mapping.md § 4). */
function scenarioError(def: EndpointDef, operation: OperationDef, scenario: string | undefined) {
  if (!scenario) return
  if (scenario === 'association_suspended' && def.space === 'association') problem('association_suspended')
  if (operation.method === 'GET') return
  if (scenario === 'version_conflict' && def.flags.ifMatch) problem('version_conflict')
  if ((MUTATION_ERRORS as string[]).includes(scenario) && def.errors.includes(scenario as ErrorCode)) problem(scenario as ErrorCode)
}

/** Exécute une implémentation : autorisation, scénarios d'erreur, puis contrôle de la réponse par son schéma. */
export async function runImplementation(id: EndpointKey, op: string, ctx: MockContext<never, never>): Promise<unknown> {
  const registered = IMPLEMENTATIONS.get(`${id} ${op}`)
  if (!registered) throw new Error(`Aucune implémentation simulée pour ${id}.${op}`)
  const { def, operation } = definition(id, op)
  authorize(def, ctx.session, ctx.params as Record<string, unknown> | undefined)
  scenarioError(def, operation, ctx.scenario)
  const out = withScenario(ctx.scenario, () => registered.impl(ctx))
  const schema = operation.response.body
  if (schema && operation.response.contentType !== 'text/event-stream') {
    const result = schema.safeParse(out)
    if (!result.success) {
      throw new Error(`Réponse simulée non conforme pour ${id}.${op} : ${JSON.stringify(result.error.issues.slice(0, 5))}`)
    }
  }
  return out
}

const pause = (ms: number) => new Promise(r => setTimeout(r, ms))

export function readScenario(event: H3Event): string | undefined {
  const header = getHeader(event, 'x-cotiz-scenario')
  const query = getQuery(event).scenario
  const value = header || (typeof query === 'string' ? query : undefined)
  return value || undefined
}

function readIfMatch(event: H3Event): number | null {
  const m = /^(?:W\/)?"?(\d+)"?$/.exec(getHeader(event, 'if-match') ?? '')
  return m ? Number(m[1]) : null
}

/** Handler Nitro d'une opération du contrat. */
export function defineContractHandler<I extends EndpointKey, N extends OperationName<I>>(id: I, op: N, impl: MockImpl<I, N>) {
  IMPLEMENTATIONS.set(`${id} ${op}`, { id, op, impl: impl as Registered['impl'] })
  const { operation } = definition(id, op)
  return defineEventHandler(async (event) => {
    const scenario = readScenario(event)
    await pause(scenario === 'chargement' ? 10_000 : 200 + Math.random() * 200)
    if (scenario === 'erreur') {
      setResponseStatus(event, 500)
      return { title: 'Erreur simulée (scénario « erreur »)', status: 500 }
    }
    try {
      const raw = operation.method === 'GET' || operation.method === 'DELETE' ? undefined : await readBody(event).catch(() => undefined)
      const ctx = {
        params: parseOr422(operation.request.params, getRouterParams(event, { decode: true })),
        query: parseOr422(operation.request.query, getQuery(event)),
        body: parseOr422(operation.request.body, raw ?? {}),
        session: sessionFromRole(getCookie(event, 'cotiz_role')),
        scenario,
        ifMatch: readIfMatch(event),
        idempotencyKey: getHeader(event, 'idempotency-key') ?? null,
        setRole: (role: string | null) => setCookieRole(event, role),
        origin: getRequestURL(event).origin,
      } as MockContext<never, never>
      const out = await runImplementation(id, op, ctx)
      setResponseStatus(event, operation.response.status)
      return operation.response.body ? out : null
    }
    catch (e) {
      if (!(e instanceof ProblemError)) throw e
      const body = problemBody(e)
      setResponseStatus(event, body.status)
      setResponseHeader(event, 'content-type', 'application/problem+json')
      return body
    }
  })
}

function setCookieRole(event: H3Event, role: string | null) {
  // Cookie lisible par le front (useSession) et par le script de capture, comme en V0.
  const value = role ? `cotiz_role=${role}; Path=/; SameSite=Lax` : 'cotiz_role=; Path=/; Max-Age=0; SameSite=Lax'
  event.node.res.appendHeader('set-cookie', value)
}

// ---------------------------------------------------------------- Outils des implémentations

export function requireSession(ctx: { session: MockSession | null }): MockSession {
  if (!ctx.session) throw new ProblemError('session_expired')
  return ctx.session
}

/** Version attendue par `If-Match` : `version_conflict` si elle est périmée. */
export function checkVersion(ctx: { ifMatch: number | null }, current: number) {
  if (ctx.ifMatch !== null && ctx.ifMatch !== current) problem('version_conflict')
}

/** Instant « maintenant » du jeu : jour de référence des maquettes, heure réelle. */
export function nowInstant(): string {
  return `${db.today}T${new Date().toISOString().slice(11, 19)}Z`
}
