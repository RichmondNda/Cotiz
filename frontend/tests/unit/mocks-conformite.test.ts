// Conformité des handlers simulés `/api/v1` (lot 0.3, étape 3) :
// - un fichier de route par opération implémentée, au chemin et à la méthode du registre de @cotiz/contracts ;
// - chaque réponse simulée passe son schéma (runImplementation le vérifie), état nominal et scénarios de l'inventaire ;
// - les erreurs déclenchables (docs/specs/v0-mapping.md § 4) renvoient un `Problem` du catalogue.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ENDPOINTS, Problem } from '@cotiz/contracts'
import type { EndpointDef } from '@cotiz/contracts'
import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDb } from '../../server/mocks/db'
import { IMPLEMENTATIONS, ProblemError, problemBody, runImplementation, sessionFromRole } from '../../server/mocks/http'
import type { MockContext } from '../../server/mocks/http'
import { ID, uid } from '../../server/mocks/ids'
import { SCENARIO_TRANSFORMS } from '../../server/mocks/scenarios'

const ROUTES_DIR = new URL('../../server/api/v1/', import.meta.url).pathname
const routeFiles = (function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
})(ROUTES_DIR)

// Chaque fichier de route enregistre son implémentation à l'import.
await Promise.all(routeFiles.map(f => import(f)))

const def = (id: string) => ENDPOINTS[id as keyof typeof ENDPOINTS] as EndpointDef
const ROLE = { platform: 'superadmin', association: 'gestionnaire', subscriber: 'souscripteur' } as const

interface Call {
  params?: Record<string, unknown>
  query?: Record<string, unknown>
  body?: unknown
  as?: keyof typeof ROLE | null
  scenario?: string
  ifMatch?: number | null
}

/** Appel d'une implémentation comme le ferait le handler : entrées passées par les schémas du contrat. */
async function call(id: string, op: string, c: Call = {}) {
  const operation = def(id).operations[op]!
  const space = c.as === undefined ? defaultSpace(id) : c.as
  const ctx = {
    params: operation.request.params?.parse(c.params ?? {}),
    query: operation.request.query?.parse(c.query ?? {}),
    body: operation.request.body?.parse(c.body ?? {}),
    session: space ? sessionFromRole(ROLE[space]) : null,
    scenario: c.scenario,
    ifMatch: c.ifMatch ?? null,
    idempotencyKey: null,
  } as MockContext<never, never>
  return runImplementation(id as never, op, ctx)
}

/** Moussa a-t-il une association en retard (me.assos, simulé) ? Sonde des scénarios et de la déclaration. */
async function moussaLate(c: Call = {}) {
  const { items } = await call('me.assos', 'list', c) as { items: { standing: string }[] }
  return items.some(i => i.standing === 'late')
}

function defaultSpace(id: string): keyof typeof ROLE | null {
  const d = def(id)
  if (d.permission === 'public') return null
  if (d.space === 'platform') return 'platform'
  if (d.space === 'association') return 'association'
  return 'subscriber'
}

async function problemOf(p: Promise<unknown>) {
  try {
    await p
  }
  catch (e) {
    if (e instanceof ProblemError) return e
    throw e
  }
  throw new Error('une erreur Problem était attendue')
}

// ---------------------------------------------------------------- Entrées d'exemple

const aid = ID.entraide
const money = (amount: number) => ({ amount, currency: 'XOF' })
const moussaCentreLate = () => [
  { installmentId: uid('installment', 'centre-communautaire:moussa-diarra:6'), amount: money(25000) },
  { installmentId: uid('installment', 'centre-communautaire:moussa-diarra:7'), amount: money(25000) },
]

/** Lecture : paramètres de chemin de chaque opération GET. */
const READS: Record<string, Call> = {
  'me.prefs get': {},
  'pf.invoices list': {}, 'pf.staff list': {},
  'bl.inv list': { params: { aid } }, 'tm.team list': { params: { aid } },
  'rm.rules list': { params: { aid } }, 'rm.queue list': { params: { aid } }, 'rm.hist list': { params: { aid } },
  'me.assos list': {}, 'me.assos get': { params: { aid } },
}

/** Écritures : entrées valides (le jeu est remis à zéro avant chaque appel). */
const WRITES: Record<string, () => Call> = {
  'auth.mfa verify': () => ({ body: { mfaToken: 'mfa.x', code: '481902' } }),
  'me.prefs replace': () => ({ as: 'association', body: { items: [{ type: 'payment.declared', channel: 'in_app', enabled: false }] } }),
  'tm.team invite': () => ({ params: { aid }, body: { firstName: 'Ali', lastName: 'Koné', email: 'ali@exemple.ci', role: 'manager' } }),
  'tm.team patch': () => ({ params: { aid, uid: uid('user', 'serge-gnagne') }, body: { role: 'viewer' } }),
  'tm.team remove': () => ({ params: { aid, uid: uid('user', 'serge-gnagne') } }),
  'rm.rules create': () => ({ params: { aid }, body: { projectId: null, trigger: 'after_due', offsetDays: 30, channels: ['in_app'], message: 'Rappel', isActive: true } }),
  'rm.rules patch': () => ({ params: { aid, id: uid('reminder-rule', 'jour-j') }, body: { isActive: false } }),
  'rm.queue handled': () => ({ params: { aid, id: uid('reminder-run', `queue-${uid('installment', 'centre-communautaire:moussa-diarra:6')}`) }, body: { outcome: 'handled' } }),
  'rm.send send': () => ({ params: { aid }, body: { projectId: ID.centre, allLate: true } }),
}

beforeEach(() => resetDb())

describe('routes simulées /api/v1', () => {
  it('un fichier par opération implémentée, au chemin et à la méthode du contrat', () => {
    const expected = [...IMPLEMENTATIONS.values()].map(({ id, op }) => {
      const o = def(id).operations[op]!
      return `${o.path.replace('/api/v1/', '').replace(/\{(\w+)\}/g, '[$1]')} ${o.method.toLowerCase()}`
    }).sort()
    const actual = routeFiles.map((f) => {
      const m = /^(.*?)(?:\/index)?\.(get|post|put|patch|delete)\.ts$/.exec(relative(ROUTES_DIR, f))!
      const src = readFileSync(f, 'utf8')
      expect(src).toMatch(/defineContractHandler\('/)
      return `${m[1]} ${m[2]}`
    }).sort()
    expect(actual).toEqual(expected)
  })

  it('chaque opération implémentée a une entrée d’exemple dans ce test', () => {
    const missing = [...IMPLEMENTATIONS.keys()].filter(k => !(k in READS) && !(k in WRITES))
    expect(missing).toEqual([])
  })
})

describe('réponses conformes au contrat — lectures', () => {
  for (const [key, c] of Object.entries(READS)) {
    const [id, op] = key.split(' ') as [string, string]
    it(key, async () => {
      await expect(call(id, op, c)).resolves.toBeDefined()
    })
  }
})

describe('réponses conformes au contrat — écritures', () => {
  for (const [key, make] of Object.entries(WRITES)) {
    const [id, op] = key.split(' ') as [string, string]
    it(key, async () => {
      const c = make() as Call & { setup?: (c: Call) => Promise<unknown> }
      await c.setup?.(c)
      await call(id, op, c)
    })
  }
})

describe('scénarios de l’inventaire : réponses conformes', () => {
  const LIST_SCENARIOS = ['vide', 'aucune-demande', 'aucun-plan', 'aucun-contrat', 'aucun-souscripteur', 'tout-lu', 'etat-suspendue', 'suspendu', 'echeance-proche', 'approuvee', 'refusee', 'graphiques-bientot-disponibles']
  for (const scenario of [...Object.keys(SCENARIO_TRANSFORMS), ...LIST_SCENARIOS]) {
    it(scenario, async () => {
      for (const [key, c] of Object.entries(READS)) {
        const [id, op] = key.split(' ') as [string, string]
        await call(id, op, { ...c, scenario }).catch((e: unknown) => {
          // Un scénario peut retirer la ressource lue (ex. `aucun-projet` → projet introuvable) : 404 accepté.
          if (!(e instanceof ProblemError && e.code === 'not_found')) throw new Error(`${key} : ${String(e)}`)
        })
      }
    })
  }

  it('aucun-retard : plus aucun souscripteur en retard ni montant en retard', async () => {
    // Rapport de projet (lot 2.6) et tableau de bord souscripteur (lot 3.2) servis par NestJS : contrôle sur les
    // associations de Moussa (me.assos, encore simulé).
    // Contrôle : sans scénario, Moussa a des échéances en retard.
    expect(await moussaLate()).toBe(true)
    expect(await moussaLate({ scenario: 'aucun-retard' })).toBe(false)
  })

  it('un scénario ne modifie jamais le jeu', async () => {
    const avant = JSON.stringify(db)
    await call('me.assos', 'list', { scenario: 'tout-est-paye' })
    expect(JSON.stringify(db)).toBe(avant)
  })
})

describe('erreurs déclenchables (v0-mapping § 4) et règles réelles', () => {
  const problem = async (id: string, op: string, c: Call) => {
    const e = await problemOf(call(id, op, c))
    expect(Problem.safeParse(problemBody(e)).success).toBe(true)
    return e.code
  }

  // version_conflict (If-Match) : plus aucune écriture simulée ne l'exige depuis la bascule de ct.get (lot 4.1).
  it('scénarios : quota_exceeded, association_suspended', async () => {
    expect(await problem('tm.team', 'invite', { ...WRITES['tm.team invite']!(), scenario: 'quota_exceeded' })).toBe('quota_exceeded')
    expect(await problem('tm.team', 'list', { ...READS['tm.team list'], scenario: 'association_suspended' })).toBe('association_suspended')
  })

  it('ressource d’une autre association → 404', async () => {
    expect(await problem('tm.team', 'list', { params: { aid: ID.man } })).toBe('not_found')
  })

  it('espace d’un autre rôle → forbidden ; sans session → session_expired', async () => {
    expect(await problem('pf.staff', 'list', { as: 'association' })).toBe('forbidden')
    expect(await problem('me.assos', 'list', { as: null })).toBe('session_expired')
  })
})

describe('mutations : état en mémoire', () => {
  it('Idempotency-Key : même clé et même corps → même réponse ; corps différent → idempotency_key_reused', async () => {
    // Mécanisme commun des mocks (server/mocks/http.ts), essayé sur une écriture encore simulée.
    const run = (body: unknown) => runImplementation('rm.send' as never, 'send', {
      params: { aid }, query: undefined, body, session: sessionFromRole('gestionnaire'), scenario: undefined, ifMatch: null, idempotencyKey: 'cle-1',
    } as MockContext<never, never>)
    const send = ENDPOINTS['rm.send'].operations.send.request.body
    const body = send.parse(WRITES['rm.send send']!().body)
    expect(await run(body)).toEqual(await run(body))
    const other = send.parse({ ...(body as object), message: 'Autre message' })
    await expect(run(other)).rejects.toMatchObject({ code: 'idempotency_key_reused' })
  })

  it('déclaration sans preuve ni référence → proof_required (règle du schéma)', async () => {
    const sansPreuve = { projectId: ID.centre, amount: money(50000), paidOn: '2026-09-25', paymentMethodId: null, allocations: moussaCentreLate() }
    const result = ENDPOINTS['me.declare'].operations.declare.request.body.safeParse(sansPreuve)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('proof_required')
  })
})
