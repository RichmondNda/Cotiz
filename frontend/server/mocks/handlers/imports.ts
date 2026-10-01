// Fichiers déposés (fl.upload) et imports Excel (im.*, lot 4.4). Aucun fichier n'est lu : l'analyse simulée reprend la
// maquette MgImport (53 lignes : 47 prêtes, 3 comptes existants, 2 erreurs, 1 doublon).
import type { MockContext } from '../http'
import { nowInstant, problem } from '../http'
import { uid } from '../ids'
import { projectRow } from '../views'
import { page } from './list'

/** Fichiers déposés pendant la session de dev (nom et type pour la preuve d'un paiement). */
export const uploads = new Map<string, { fileName: string, mimeType: string, sizeBytes: number, purpose: string, createdAt: string }>()

const ALLOWED: Record<string, RegExp> = {
  payment_proof: /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/,
  import_source: /^(text\/csv|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|application\/vnd\.ms-excel)$/,
  logo: /^image\//,
  cover: /^image\//,
}
const MAX_BYTES = 10 * 1024 * 1024

export function uploadCreate(ctx: MockContext<'fl.upload', 'create'> & { origin?: string }) {
  const b = ctx.body
  if (b.sizeBytes > MAX_BYTES) problem('file_too_large')
  const rule = ALLOWED[b.purpose]
  if (rule && !rule.test(b.mimeType) && !(b.purpose === 'import_source' && /\.(csv|xlsx)$/i.test(b.fileName))) problem('file_type_not_allowed')
  const id = uid('file', `${b.fileName}-${Date.now()}-${Math.random()}`)
  uploads.set(id, { fileName: b.fileName, mimeType: b.mimeType, sizeBytes: b.sizeBytes, purpose: b.purpose, createdAt: nowInstant() })
  return {
    fileId: id, uploadUrl: `${ctx.origin ?? 'http://localhost:3000'}/api/_dev/uploads/${id}`, method: 'PUT' as const,
    headers: { 'content-type': b.mimeType }, expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
  }
}

export function uploadComplete(ctx: MockContext<'fl.upload', 'complete'>) {
  const f = uploads.get(ctx.params.id) ?? problem('not_found')
  return {
    id: ctx.params.id, purpose: f.purpose as 'payment_proof', fileName: f.fileName, mimeType: f.mimeType, sizeBytes: f.sizeBytes,
    sha256: '0'.repeat(64), scanStatus: 'clean' as const, createdAt: f.createdAt,
  }
}

// ---------------------------------------------------------------- Imports

type Field = 'firstName' | 'lastName' | 'phone' | 'email' | 'address'
interface ImportState {
  id: string
  projectId: string
  associationId: string
  sourceFileId: string
  status: 'uploaded' | 'mapped' | 'validated' | 'importing' | 'completed' | 'failed'
  mapping: Record<string, Field | null>
  rows: { id: string, rowNumber: number, category: 'ready' | 'existing' | 'error' | 'duplicate' | 'ignored', values: Partial<Record<Field, string>>, errors: { field: Field, code: string }[], duplicateOf: number | null, existingUserId: string | null }[]
  createdAt: string
}

const jobs = new Map<string, ImportState>()

const COLUMNS: { name: string, samples: string[], field: Field }[] = [
  { name: 'Prénom', samples: ['Aïcha', 'Yao', 'Mariam'], field: 'firstName' },
  { name: 'NOM', samples: ['Bamba', 'Kouamé', 'Coulibaly'], field: 'lastName' },
  { name: 'Tel', samples: ['0712345678', '0501…', '0102…'], field: 'phone' },
  { name: 'Mail', samples: ['[email]', '—', '[email]'], field: 'email' },
  { name: 'Quartier', samples: ['Yopougon', 'Abobo', 'Cocody'], field: 'address' },
]
/** Lignes non détaillées par la maquette : prêtes (47 au total, dont la ligne 1 détaillée). */
const HIDDEN_READY = 46
const HIDDEN_EXISTING = 2

function job(id: string, aid: string): ImportState {
  const j = jobs.get(id)
  if (!j || j.associationId !== aid) problem('not_found')
  return j
}

function view(j: ImportState) {
  const counts = { ready: HIDDEN_READY, existing: HIDDEN_EXISTING, error: 0, duplicate: 0, ignored: 0 }
  for (const r of j.rows) counts[r.category] += 1
  return {
    id: j.id, projectId: j.projectId, sourceFileId: j.sourceFileId, status: j.status,
    columns: COLUMNS.map(c => ({ name: c.name, samples: c.samples, field: j.mapping[c.name] ?? null })),
    counts, createdAt: j.createdAt,
  }
}

export function importCreate(ctx: MockContext<'im.flow', 'create'>) {
  const project = projectRow(ctx.params.pid, ctx.params.aid)
  const file = uploads.get(ctx.body.fileId) ?? problem('not_found')
  if (!/\.(csv|xlsx)$/i.test(file.fileName)) problem('file_type_not_allowed')
  const id = uid('import', `${ctx.body.fileId}`)
  const r = (n: number, category: ImportState['rows'][number]['category'], values: ImportState['rows'][number]['values'], o: Partial<ImportState['rows'][number]> = {}) =>
    ({ id: uid('import-row', `${id}-${n}`), rowNumber: n, category, values, errors: [], duplicateOf: null, existingUserId: null, ...o })
  jobs.set(id, {
    id, projectId: project.id, associationId: project.associationId, sourceFileId: ctx.body.fileId, status: 'mapped',
    mapping: Object.fromEntries(COLUMNS.map(c => [c.name, c.field])), createdAt: nowInstant(),
    rows: [
      r(12, 'error', { firstName: 'Yao', lastName: 'Kouamé', phone: '07 12 34' }, { errors: [{ field: 'phone', code: 'invalid_phone' }] }),
      r(27, 'error', { firstName: '', lastName: 'Coulibaly', phone: '+225 05 [XX XX XX XX]' }, { errors: [{ field: 'firstName', code: 'required' }] }),
      r(31, 'duplicate', { firstName: 'Mariam', lastName: 'Diallo', phone: '+225 01 [XX XX XX XX]' }, { duplicateOf: 8 }),
      r(4, 'existing', { firstName: 'Kadiatou', lastName: 'Sanogo', phone: '+225 01 [XX XX XX XX]' }, { existingUserId: uid('user', 'kadiatou-sanogo') }),
      r(1, 'ready', { firstName: 'Aïcha', lastName: 'Bamba', phone: '+225 07 12 34 56 78' }),
    ],
  })
  return view(jobs.get(id)!)
}

export function importGet(ctx: MockContext<'im.read', 'get'>) {
  return view(job(ctx.params.id, ctx.params.aid))
}

export function importRows(ctx: MockContext<'im.read', 'rows'>) {
  const j = job(ctx.params.id, ctx.params.aid)
  const rows = j.rows.filter(r => !ctx.query.category || r.category === ctx.query.category)
  return page(rows.map(r => ({ ...r, values: { ...r.values }, errors: [...r.errors] })), ctx.query)
}

export function importMapping(ctx: MockContext<'im.steps', 'mapping'>) {
  const j = job(ctx.params.id, ctx.params.aid)
  if (j.status === 'completed' || j.status === 'importing') problem('invalid_state')
  Object.assign(j.mapping, ctx.body.mapping)
  j.status = 'mapped'
  return view(j)
}

export function importRow(ctx: MockContext<'im.steps', 'row'>) {
  const j = job(ctx.params.id, ctx.params.aid)
  const r = j.rows.find(x => x.id === ctx.params.rowId) ?? problem('not_found')
  if (ctx.body.ignore) r.category = 'ignored'
  if (ctx.body.values) {
    Object.assign(r.values, ctx.body.values)
    r.errors = []
    if (r.category === 'error') r.category = 'ready'
  }
  return { ...r, values: { ...r.values }, errors: [...r.errors] }
}

export function importCommit(ctx: MockContext<'im.commit', 'commit'>) {
  const j = job(ctx.params.id, ctx.params.aid)
  if (j.status === 'completed' || j.status === 'importing') problem('invalid_state')
  // Les lignes simulées ne sont pas inscrites : leurs données sont fictives (absentes du jeu de référence).
  j.status = 'completed'
  return view(j)
}
