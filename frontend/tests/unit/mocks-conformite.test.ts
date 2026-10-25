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
const P = { aid, pid: ID.centre }
const money = (amount: number) => ({ amount, currency: 'XOF' })
const firstPending = () => db.payments.find(p => p.status === 'pending' && p.id === uid('payment', 'pm-awa-kone'))!
const moussaCentreLate = () => [
  { installmentId: uid('installment', 'centre-communautaire:moussa-diarra:6'), amount: money(25000) },
  { installmentId: uid('installment', 'centre-communautaire:moussa-diarra:7'), amount: money(25000) },
]

/** Lecture : paramètres de chemin de chaque opération GET. */
const READS: Record<string, Call> = {
  'me.profile get': {}, 'me.prefs get': {}, 'nt.list list': {}, 'nt.list unreadCount': {},
  'pf.asso.sub projects': { params: { id: aid } },
  'pf.asso.sub members': { params: { id: aid } }, 'pf.invoices list': {}, 'pf.staff list': {},
  'as.dashboard get': { params: { aid } }, 'bl.inv list': { params: { aid } }, 'tm.team list': { params: { aid } },
  'ct.list list': { params: { aid } }, 'ct.get get': { params: P },
  'rp.report get': { params: P }, 'en.list list': { params: P }, 'mb.list list': { params: { aid } },
  'mb.get get': { params: { aid, uid: ID.moussa } }, 'mb.timeline list': { params: { aid, uid: ID.moussa } },
  'mb.codes list': { params: { aid } }, 'lg.grid get': { params: P },
  'lg.inst get': { params: { aid, iid: uid('installment', 'centre-communautaire:moussa-diarra:7') } },
  'lg.pay.list list': { params: { aid }, query: { status: 'all' } }, 'lg.pay.get get': { params: { aid, payId: uid('payment', 'pm-awa-kone') } },
  'rm.rules list': { params: { aid } }, 'rm.queue list': { params: { aid } }, 'rm.hist list': { params: { aid } },
  'me.dash get': {}, 'me.projects list': {}, 'me.project get': { params: { pid: ID.centre } },
  'me.payment get': { params: { id: uid('payment', 'pm-md-07-c') } }, 'me.history list': {}, 'me.history series': {},
  'me.contract get': { params: { pid: ID.voyage } }, 'me.contracts list': {}, 'me.assos list': {}, 'me.assos get': { params: { aid } },
}

/** Écritures : entrées valides (le jeu est remis à zéro avant chaque appel). */
const WRITES: Record<string, () => Call> = {
  'auth.mfa verify': () => ({ body: { mfaToken: 'mfa.x', code: '481902' } }),
  'me.profile patch': () => ({ body: { email: 'moussa@exemple.ci' }, ifMatch: 1 }),
  'me.profile changePassword': () => ({ body: { currentPassword: 'motdepasse', newPassword: 'Cotiz2026!' } }),
  'me.prefs replace': () => ({ as: 'association', body: { items: [{ type: 'payment.declared', channel: 'in_app', enabled: false }] } }),
  'nt.read read': () => ({ params: { id: uid('notification', 'nt-mb-1') } }),
  'nt.read readAll': () => ({}),
  'tm.team invite': () => ({ params: { aid }, body: { firstName: 'Ali', lastName: 'Koné', email: 'ali@exemple.ci', role: 'manager' } }),
  'tm.team patch': () => ({ params: { aid, uid: uid('user', 'serge-gnagne') }, body: { role: 'viewer' } }),
  'tm.team remove': () => ({ params: { aid, uid: uid('user', 'serge-gnagne') } }),
  'ct.get update': () => ({ params: { aid, pid: ID.tontine }, body: { bodyTemplate: 'Texte', signerName: 'Awa Koné', signerTitle: 'trésorière' }, ifMatch: 1 }),
  'ct.get lock': () => ({ params: { aid, pid: ID.tontine }, ifMatch: 1 }),
  'mb.lookup lookup': () => ({ params: { aid }, body: { phone: '+2250544218790', projectId: ID.tontine } }),
  'en.create create': () => ({ params: { aid, pid: ID.tontine }, body: { phone: '+2250709090909', firstName: 'Nina', lastName: 'Bamba' } }),
  'en.withdraw withdraw': () => ({ params: { aid, eid: uid('enrollment', 'centre-communautaire:koffi-brou') }, body: {} }),
  'mb.patch patch': () => ({ params: { aid, uid: ID.moussa }, body: { address: 'Abobo, Abidjan' }, ifMatch: 1 }),
  'mb.resend regenerate': () => ({ params: { aid, uid: uid('user', 'fatou-traore') } }),
  'mb.codes markHanded': () => ({ params: { aid, codeId: uid('activation-code', 'fatou') } }),
  'lg.pay.validate validate': () => ({ params: { aid, payId: uid('payment', 'pm-awa-kone') }, body: {}, ifMatch: 1 }),
  'lg.pay.reject reject': () => ({ params: { aid, payId: uid('payment', 'pm-awa-kone') }, body: { reasonCode: 'unreadable_proof' }, ifMatch: 1 }),
  'lg.pay.revert revert': () => ({ params: { aid, payId: uid('payment', 'pm-awa-kone') }, setup: () => call('lg.pay.validate', 'validate', { params: { aid, payId: uid('payment', 'pm-awa-kone') }, body: {}, ifMatch: 1 }) } as Call),
  'rm.rules create': () => ({ params: { aid }, body: { projectId: null, trigger: 'after_due', offsetDays: 30, channels: ['in_app'], message: 'Rappel', isActive: true } }),
  'rm.rules patch': () => ({ params: { aid, id: uid('reminder-rule', 'jour-j') }, body: { isActive: false } }),
  'rm.queue handled': () => ({ params: { aid, id: uid('reminder-run', `queue-${uid('installment', 'centre-communautaire:moussa-diarra:6')}`) }, body: { outcome: 'handled' } }),
  'rm.send send': () => ({ params: { aid }, body: { projectId: ID.centre, allLate: true } }),
  'fl.upload create': () => ({ as: 'subscriber', body: { purpose: 'payment_proof', fileName: 'recu.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 } }),
  'fl.upload complete': () => ({ as: 'subscriber', params: { id: 'X' }, setup: upload } as Call),
  'im.flow create': () => ({ params: P, body: { fileId: 'X' }, setup: uploadXlsx } as Call),
  'im.read get': () => ({ params: { aid, id: 'X' }, setup: importJob } as Call),
  'im.read rows': () => ({ params: { aid, id: 'X' }, setup: importJob } as Call),
  'im.steps mapping': () => ({ params: { aid, id: 'X' }, body: { mapping: { Mail: null } }, setup: importJob } as Call),
  'im.steps row': () => ({ params: { aid, id: 'X', rowId: 'X' }, body: { ignore: true }, setup: importJob } as Call),
  'im.commit commit': () => ({ params: { aid, id: 'X' }, setup: importJob } as Call),
  'me.alloc preview': () => ({ body: { projectId: ID.centre, amount: money(75000) } }),
  'me.declare declare': () => ({ body: { projectId: ID.centre, amount: money(50000), paidOn: '2026-09-25', paymentMethodId: null, transactionReference: 'OM-1', allocations: moussaCentreLate() } }),
  'me.sign sign': () => ({ params: { pid: ID.voyage }, setup: async (c: Call) => { c.body = { renderedSha256: ((await call('me.contract', 'get', { params: { pid: ID.voyage } })) as { renderedSha256: string }).renderedSha256, accepted: true } } } as Call),
}

// Étapes préalables de certaines écritures (dépôt, import) : elles remplissent les `X` de l'appel.
async function upload(c: Call) {
  const t = await call('fl.upload', 'create', { as: 'subscriber', body: { purpose: 'payment_proof', fileName: 'recu.jpg', mimeType: 'image/jpeg', sizeBytes: 1000 } }) as { fileId: string }
  c.params = { id: t.fileId }
}
async function uploadXlsx(c: Call) {
  const t = await call('fl.upload', 'create', { as: 'association', body: { purpose: 'import_source', fileName: 'membres.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', sizeBytes: 1000 } }) as { fileId: string }
  c.body = { fileId: t.fileId }
}
async function importJob(c: Call) {
  const b: Call = {}
  await uploadXlsx(b)
  const job = await call('im.flow', 'create', { params: P, body: b.body }) as { id: string }
  const rows = await call('im.read', 'rows', { params: { aid, id: job.id } }) as { items: { id: string }[] }
  c.params = { ...c.params, id: job.id, ...(c.params && 'rowId' in c.params ? { rowId: rows.items[0]!.id } : {}) }
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
    type Rapport = { standingCounts: { late: number }, rows: { lateCount: number }[] }
    // Contrôle : sans scénario, Centre communautaire a des retardataires.
    expect((await call('rp.report', 'get', { params: P }) as Rapport).standingCounts.late).toBeGreaterThan(0)
    const r = await call('rp.report', 'get', { params: P, scenario: 'aucun-retard' }) as Rapport
    expect(r.standingCounts.late).toBe(0)
    expect(r.rows.map(x => x.lateCount).filter(n => n > 0)).toEqual([])
  })

  it('file-vide : aucun paiement à valider', async () => {
    const l = await call('lg.pay.list', 'list', { params: { aid }, scenario: 'file-vide' }) as { items: unknown[] }
    expect(l.items).toEqual([])
  })

  it('un scénario ne modifie jamais le jeu', async () => {
    const avant = JSON.stringify(db)
    await call('me.dash', 'get', { scenario: 'tout-est-paye' })
    expect(JSON.stringify(db)).toBe(avant)
  })
})

describe('erreurs déclenchables (v0-mapping § 4) et règles réelles', () => {
  const problem = async (id: string, op: string, c: Call) => {
    const e = await problemOf(call(id, op, c))
    expect(Problem.safeParse(problemBody(e)).success).toBe(true)
    return e.code
  }

  it('scénarios : allocation_mismatch, quota_exceeded, version_conflict, association_suspended, payment_already_reviewed', async () => {
    expect(await problem('me.declare', 'declare', { ...WRITES['me.declare declare']!(), scenario: 'allocation_mismatch' })).toBe('allocation_mismatch')
    expect(await problem('lg.pay.validate', 'validate', { ...WRITES['lg.pay.validate validate']!(), scenario: 'allocation_mismatch' })).toBe('allocation_mismatch')
    expect(await problem('en.create', 'create', { ...WRITES['en.create create']!(), scenario: 'quota_exceeded' })).toBe('quota_exceeded')
    expect(await problem('mb.patch', 'patch', { ...WRITES['mb.patch patch']!(), scenario: 'version_conflict' })).toBe('version_conflict')
    expect(await problem('as.dashboard', 'get', { ...READS['as.dashboard get'], scenario: 'association_suspended' })).toBe('association_suspended')
    expect(await problem('lg.pay.reject', 'reject', { ...WRITES['lg.pay.reject reject']!(), scenario: 'payment_already_reviewed' })).toBe('payment_already_reviewed')
  })

  it('valider deux fois le même paiement → payment_already_reviewed', async () => {
    await call('lg.pay.validate', 'validate', WRITES['lg.pay.validate validate']!())
    expect(await problem('lg.pay.validate', 'validate', { ...WRITES['lg.pay.validate validate']!(), ifMatch: 2 })).toBe('payment_already_reviewed')
  })

  it('If-Match périmé → version_conflict', async () => {
    expect(await problem('mb.patch', 'patch', { ...WRITES['mb.patch patch']!(), ifMatch: 7 })).toBe('version_conflict')
  })

  it('répartition qui ne fait pas le montant → allocation_mismatch ; au-delà du reste → amount_exceeds_remaining', async () => {
    const base = WRITES['me.declare declare']!()
    expect(await problem('me.declare', 'declare', { ...base, body: { ...(base.body as object), amount: money(40000) } })).toBe('allocation_mismatch')
    expect(await problem('me.declare', 'declare', { ...base, body: { ...(base.body as object), amount: money(10_000_000) } })).toBe('amount_exceeds_remaining')
  })

  it('déclarer sur un projet dont le contrat n’est pas signé → signature_required', async () => {
    const e = await problem('me.declare', 'declare', { body: { projectId: ID.voyage, amount: money(10000), paidOn: '2026-09-25', paymentMethodId: null, transactionReference: 'x', allocations: [{ installmentId: ID.voyage, amount: money(10000) }] } })
    expect(e).toBe('signature_required')
  })

  it('ressource d’une autre association → 404', async () => {
    expect(await problem('rp.report', 'get', { params: { aid, pid: ID.mutuelle } })).toBe('not_found')
    expect(await problem('as.dashboard', 'get', { params: { aid: ID.man } })).toBe('not_found')
  })

  it('espace d’un autre rôle → forbidden ; sans session → session_expired', async () => {
    expect(await problem('pf.staff', 'list', { as: 'association' })).toBe('forbidden')
    expect(await problem('me.dash', 'get', { as: null })).toBe('session_expired')
  })
})

describe('mutations : état en mémoire', () => {
  it('déclarer puis valider : les échéances d’août et septembre de Moussa passent payées', async () => {
    const declared = await call('me.declare', 'declare', WRITES['me.declare declare']!()) as { id: string, status: string }
    expect(declared.status).toBe('pending')
    let dash = await call('me.dash', 'get') as { late: unknown, remainingTotal: { amount: number } }
    expect(dash.late).toBeNull()
    await call('lg.pay.validate', 'validate', { params: { aid, payId: declared.id }, body: {}, ifMatch: 1 })
    dash = await call('me.dash', 'get') as { late: unknown, remainingTotal: { amount: number } }
    expect(dash.remainingTotal.amount).toBe(345000)
    expect(firstPending()).toBeDefined()
  })

  it('valider avec une répartition ajustée puis annuler : la répartition déclarée est reproposée, rien n’est supprimé', async () => {
    const payId = uid('payment', 'pm-awa-kone')
    const awa = (seq: number) => uid('installment', `centre-communautaire:awa-kone:${seq}`)
    const avant = db.allocations.length
    // Montant reçu 50 000 F au lieu de 75 000 F : septembre et octobre seulement.
    await call('lg.pay.validate', 'validate', { params: { aid, payId }, ifMatch: 1, body: {
      amountReceived: money(50000), allocations: [{ installmentId: awa(7), amount: money(25000) }, { installmentId: awa(8), amount: money(25000) }],
    } })
    expect(db.installments.find(i => i.id === awa(7))!.amountPaid).toBe(25000)
    expect(db.projects.find(p => p.id === ID.centre)!.financialTermsLockedAt).not.toBeNull()
    const annule = await call('lg.pay.revert', 'revert', { params: { aid, payId } }) as { status: string, covered: { installmentId: string, amount: { amount: number }, state: string }[] }
    expect(annule.status).toBe('pending')
    expect(annule.covered.map(c => [c.installmentId, c.amount.amount, c.state])).toEqual([7, 8, 9].map(s => [awa(s), 25000, 'proposed']))
    expect(db.installments.find(i => i.id === awa(7))!.amountPaid).toBe(0)
    expect(db.allocations.length).toBeGreaterThan(avant)
    // Revalider sans corps : la répartition déclarée (75 000 F) passe.
    await expect(call('lg.pay.validate', 'validate', { params: { aid, payId }, body: {}, ifMatch: 3 })).resolves.toBeDefined()
  })

  it('Idempotency-Key : même clé et même corps → même réponse ; corps différent → idempotency_key_reused', async () => {
    const run = (body: unknown) => runImplementation('me.declare' as never, 'declare', {
      params: undefined, query: undefined, body, session: sessionFromRole('souscripteur'), scenario: undefined, ifMatch: null, idempotencyKey: 'cle-1',
    } as MockContext<never, never>)
    const body = WRITES['me.declare declare']!().body
    const parsed = ENDPOINTS['me.declare'].operations.declare.request.body.parse(body)
    const first = await run(parsed) as { id: string }
    expect((await run(parsed) as { id: string }).id).toBe(first.id)
    expect(db.payments.filter(p => p.userId === ID.moussa && p.status === 'pending')).toHaveLength(1)
    const other = ENDPOINTS['me.declare'].operations.declare.request.body.parse({ ...(body as object), amount: money(25000), allocations: moussaCentreLate().slice(0, 1) })
    await expect(run(other)).rejects.toMatchObject({ code: 'idempotency_key_reused' })
  })

  it('déclaration sans preuve ni référence → proof_required (règle du schéma)', async () => {
    const { transactionReference: _ref, ...sansPreuve } = WRITES['me.declare declare']!().body as Record<string, unknown>
    const ctx = { body: sansPreuve, session: sessionFromRole('souscripteur') }
    const result = ENDPOINTS['me.declare'].operations.declare.request.body.safeParse(ctx.body)
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('proof_required')
  })

  it('inscrire un nouveau souscripteur : inscription et code d’activation à remettre', async () => {
    const r = await call('en.create', 'create', WRITES['en.create create']!()) as { enrollment: { status: string }, handoff: { code: string } | null }
    expect(r.enrollment.status).toBe('active')
    expect(r.handoff?.code).toBe('K7M4-P9QX')
  })
})
