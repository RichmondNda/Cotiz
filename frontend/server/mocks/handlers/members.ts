// Souscripteurs d'une association : recherche, inscription, retrait, annuaire, fiche, frise, codes d'activation.
import { formatMoney } from '@cotiz/domain'
import { libelleCouverture } from '../../../app/utils/echeances'
import { formatMois } from '../../../app/utils/format'
import { db } from '../db'
import type { EnrollmentRow, UserRow } from '../db'
import type { MockContext } from '../http'
import { checkVersion, nowInstant, problem } from '../http'
import { uid } from '../ids'
import { amountPending, associationFigures, enrollmentFigures, enrollmentsOfProject, memberStandingIn, projectById, today } from '../ledger'
import { signEnrollment } from '../scenarios'
import { enrollment, installment, personContact, projectRef, projectRow, userRow } from '../views'
import { handoff } from './handoff'
import { page } from './list'

const F = (amount: number) => formatMoney({ amount, currency: 'XOF' })
const numeric = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

function projectsOf(associationId: string) {
  return new Set(db.projects.filter(p => p.associationId === associationId).map(p => p.id))
}

function enrollmentsIn(associationId: string, userId: string): EnrollmentRow[] {
  const projects = projectsOf(associationId)
  return db.enrollments.filter(e => e.userId === userId && projects.has(e.projectId))
}

// ---------------------------------------------------------------- Recherche et inscription

export function lookup(ctx: MockContext<'mb.lookup', 'lookup'>) {
  const project = projectRow(ctx.body.projectId, ctx.params.aid)
  const u = db.users.find(x => x.phone === ctx.body.phone)
  if (!u) return { result: 'new' as const }
  const person = { id: u.id, firstName: u.firstName, lastInitial: (u.lastName || u.firstName).charAt(0).toUpperCase() }
  if (enrollmentsOfProject(project.id).some(e => e.userId === u.id)) return { result: 'already_enrolled' as const, person }
  const associations = new Set(db.memberships.filter(m => m.userId === u.id && m.role === 'subscriber').map(m => m.associationId))
  return { result: 'existing_user' as const, person, associationsCount: Math.max(1, associations.size) }
}

export function enrollmentsList(ctx: MockContext<'en.list', 'list'>) {
  const project = projectRow(ctx.params.pid, ctx.params.aid)
  if (ctx.scenario === 'aucun-souscripteur') return page([], ctx.query)
  let rows = enrollmentsOfProject(project.id, true).map(enrollment)
  if (ctx.query.standing) rows = rows.filter(r => r.standing === ctx.query.standing)
  if (ctx.query.q) {
    const t = ctx.query.q.toLowerCase()
    rows = rows.filter(r => `${r.member.firstName} ${r.member.lastName}`.toLowerCase().includes(t) || r.member.phone?.includes(t))
  }
  const extra = db.unlisted.find(u => u.scopeId === project.id)?.members ?? 0
  return page(rows, ctx.query, { total: ctx.query.standing || ctx.query.q ? 0 : rows.length + extra })
}

export function enrollmentCreate(ctx: MockContext<'en.create', 'create'>) {
  const project = projectRow(ctx.params.pid, ctx.params.aid)
  if (project.status !== 'enrolling' && project.status !== 'active') problem('invalid_state')
  const b = ctx.body
  let user: UserRow
  let created = false
  if ('userId' in b) {
    user = userRow(b.userId)
  }
  else {
    const existing = db.users.find(u => u.phone === b.phone)
    if (existing) {
      user = existing
    }
    else {
      const key = `${b.firstName}-${b.lastName}-${b.phone}`.toLowerCase()
      user = {
        id: uid('user', key), key, firstName: b.firstName, lastName: b.lastName, phone: b.phone, email: b.email ?? null,
        status: 'pending_activation', locale: 'fr-CI', address: b.address ?? null, city: null, passwordChangedAt: null, lastLoginAt: null, version: 1,
      }
      db.users.push(user)
      created = true
    }
  }
  if (enrollmentsOfProject(project.id).some(e => e.userId === user.id)) problem('already_enrolled')
  const limit = db.plans.find(p => p.id === db.associations.find(a => a.id === project.associationId)!.planId)!.limits.subscribers
  if (limit !== null && associationFigures(project.associationId).membersCount >= limit) problem('quota_exceeded')
  if (!db.memberships.some(m => m.userId === user.id && m.associationId === project.associationId && m.role === 'subscriber')) {
    db.memberships.push({ associationId: project.associationId, userId: user.id, role: 'subscriber', status: 'active', title: null, joinedAt: nowInstant() })
  }
  const startsFrom = b.startsFrom ?? today()
  const row: EnrollmentRow = {
    id: uid('enrollment', `${project.key}:${user.key}`), projectId: project.id, userId: user.id,
    status: project.contractRequired ? 'pending_signature' : 'active', startsFrom, joinedAt: nowInstant(), contractSignedAt: null, withdrawnAt: null,
  }
  db.enrollments.push(row)
  // Sans contrat à signer, l'échéancier est généré tout de suite (architecture/04-flows.md § 4.3).
  if (row.status === 'active') signEnrollment(db, row, row.joinedAt)
  let code = null
  if (created) {
    const h = handoff(user, 'subscriber')
    db.activationCodes.push({ id: uid('activation-code', user.key), associationId: project.associationId, userId: user.id, code: h.code, issuedAt: nowInstant(), expiresAt: h.expiresAt, handedAt: null })
    code = h
  }
  return { enrollment: enrollment(row), handoff: code }
}

export function enrollmentWithdraw(ctx: MockContext<'en.withdraw', 'withdraw'>) {
  const e = db.enrollments.find(x => x.id === ctx.params.eid) ?? problem('not_found')
  if (projectById(e.projectId)?.associationId !== ctx.params.aid) problem('not_found')
  if (e.status === 'withdrawn') problem('invalid_state')
  Object.assign(e, { status: 'withdrawn', withdrawnAt: nowInstant() })
  // Échéances futures annulées ; l'historique (paiements validés) est conservé.
  for (const i of db.installments.filter(x => x.enrollmentId === e.id && x.dueDate > today() && x.amountPaid === 0 && amountPending(x.id) === 0)) i.persistedStatus = 'canceled'
  return enrollment(e)
}

// ---------------------------------------------------------------- Annuaire et fiche

/** Totaux de l'annuaire : projets engagés ; à défaut (signature attendue partout), ceux en attente de signature. */
function directoryTotals(list: EnrollmentRow[]) {
  const live = list.filter(e => e.status !== 'withdrawn')
  const engaged = live.filter(e => e.status !== 'pending_signature')
  const base = engaged.length ? engaged : live
  const figures = base.map(enrollmentFigures)
  return { paid: figures.reduce((t, f) => t + f.paid, 0), remaining: figures.reduce((t, f) => t + f.remaining, 0) }
}

export function membersList(ctx: MockContext<'mb.list', 'list'>) {
  const aid = ctx.params.aid
  if (ctx.scenario === 'vide') return page([], ctx.query)
  let rows = db.memberships
    .filter(m => m.associationId === aid && m.role === 'subscriber' && m.status !== 'removed')
    .map((m) => {
      const u = userRow(m.userId)
      const list = enrollmentsIn(aid, u.id)
      const totals = directoryTotals(list)
      return {
        member: personContact(u), projects: list.filter(e => e.status !== 'withdrawn').map(e => projectRef(projectRow(e.projectId))),
        totalPaid: { amount: totals.paid, currency: 'XOF' as const }, totalRemaining: { amount: totals.remaining, currency: 'XOF' as const },
        standing: memberStandingIn(aid, u.id),
      }
    })
  const filtered = Boolean(ctx.query.q || ctx.query.projectId || ctx.query.standing)
  if (ctx.query.projectId) rows = rows.filter(r => r.projects.some(p => p.id === ctx.query.projectId))
  if (ctx.query.standing) rows = rows.filter(r => r.standing === ctx.query.standing)
  if (ctx.query.q) {
    const t = ctx.query.q.toLowerCase()
    rows = rows.filter(r => `${r.member.firstName} ${r.member.lastName}`.toLowerCase().includes(t) || r.member.phone?.includes(t))
  }
  return page(rows, ctx.query, { total: filtered ? 0 : associationFigures(aid).membersCount })
}

function memberDetail(aid: string, userId: string) {
  const u = userRow(userId)
  const membership = db.memberships.find(m => m.associationId === aid && m.userId === userId && m.role === 'subscriber') ?? problem('not_found')
  const list = enrollmentsIn(aid, userId)
  return {
    member: { ...personContact(u), address: u.address, city: u.city, accountStatus: u.status },
    memberSince: list.map(e => e.joinedAt).sort()[0] ?? membership.joinedAt,
    standing: memberStandingIn(aid, userId),
    enrollments: list.map(e => ({
      ...enrollment(e), project: projectRef(projectRow(e.projectId)),
      installments: enrollmentFigures(e).installments.map(installment),
    })),
    version: u.version,
  }
}

export function memberGet(ctx: MockContext<'mb.get', 'get'>) {
  return memberDetail(ctx.params.aid, ctx.params.uid)
}

export function memberPatch(ctx: MockContext<'mb.patch', 'patch'>) {
  const u = userRow(ctx.params.uid)
  memberDetail(ctx.params.aid, u.id)
  checkVersion(ctx, u.version)
  const b = ctx.body
  if (b.phone && db.users.some(x => x.id !== u.id && x.phone === b.phone)) problem('phone_taken')
  Object.assign(u, Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)), { version: u.version + 1 })
  return memberDetail(ctx.params.aid, u.id)
}

/** Frise du souscripteur sur les projets de l'association, plus récent d'abord (textes de MgSouscripteur). */
export function memberTimeline(ctx: MockContext<'mb.timeline', 'list'>) {
  const aid = ctx.params.aid
  const u = userRow(ctx.params.uid)
  const events: { id: string, at: string, type: string, title: string, detail: string | null, tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand', project: { id: string, name: string } | null }[] = []
  for (const e of enrollmentsIn(aid, u.id)) {
    const project = projectRow(e.projectId)
    const ref = projectRef(project)
    const installments = enrollmentFigures(e).installments
    for (const p of db.payments.filter(x => x.enrollmentId === e.id)) {
      const covered = db.allocations.filter(a => a.paymentId === p.id).map(a => installments.find(i => i.id === a.installmentId)).filter(i => i !== undefined)
      const months = libelleCouverture(covered.map(i => ({ date: i.dueDate, rang: i.sequence, estFondsEntree: i.kind === 'entry_fee' })))
      if (p.status === 'pending') {
        events.push({ id: `${p.id}-declare`, at: p.declaredAt, type: 'payment.declared', title: `Paiement déclaré — ${F(p.amountDeclared)}`, detail: [numeric(p.declaredAt), months, 'en attente'].filter(Boolean).join(' · '), tone: 'warning', project: ref })
      }
      else if (p.status === 'validated') {
        const by = p.reviewedBy ? userRow(p.reviewedBy) : null
        events.push({ id: `${p.id}-valide`, at: p.reviewedAt ?? p.declaredAt, type: 'payment.validated', title: `Paiement validé — ${F(p.amountReceived ?? p.amountDeclared)}`, detail: [numeric(p.declaredAt), months, by && `par ${by.firstName} ${by.lastName}`].filter(Boolean).join(' · '), tone: 'success', project: ref })
      }
      else {
        events.push({ id: `${p.id}-rejete`, at: p.reviewedAt ?? p.declaredAt, type: 'payment.rejected', title: `Paiement rejeté — ${F(p.amountDeclared)}`, detail: [numeric(p.declaredAt), months].filter(Boolean).join(' · '), tone: 'danger', project: ref })
      }
    }
    for (const i of installments.filter(x => x.status === 'late')) {
      const reminder = db.reminderRuns.find(r => r.installmentId === i.id)
      const at = reminder?.at ?? `${i.dueDate}T00:00:00Z`
      const month = formatMois(i.dueDate, 'seul').toLowerCase()
      const by = reminder?.triggeredBy ? userRow(reminder.triggeredBy) : null
      const detail = reminder ? (by ? `relance envoyée par ${by.firstName} ${by.lastName}` : 'relance automatique envoyée') : null
      events.push({ id: `${i.id}-retard`, at, type: 'installment.late', title: `Échéance ${/^[aeiouéè]/i.test(month) ? 'd’' : 'de '}${month} en retard`, detail: [numeric(at), detail].filter(Boolean).join(' · '), tone: 'danger', project: ref })
    }
    if (e.contractSignedAt) {
      events.push({ id: `${e.id}-signe`, at: e.contractSignedAt, type: 'contract.signed', title: `Contrat ${project.name} signé`, detail: numeric(e.contractSignedAt), tone: 'success', project: ref })
    }
    else {
      events.push({ id: `${e.id}-envoye`, at: e.joinedAt, type: 'contract.sent', title: `Contrat ${project.name} envoyé`, detail: `${numeric(e.joinedAt)} · en attente de signature`, tone: 'warning', project: ref })
      events.push({ id: `${e.id}-inscrit`, at: e.joinedAt, type: 'enrollment.created', title: `Inscription au projet ${project.name}`, detail: numeric(e.joinedAt), tone: 'info', project: ref })
    }
  }
  events.sort((a, b) => b.at.localeCompare(a.at))
  return page(events, ctx.query)
}

// ---------------------------------------------------------------- Codes d'activation

export function regenerateCode(ctx: MockContext<'mb.resend', 'regenerate'>) {
  const u = userRow(ctx.params.uid)
  memberDetail(ctx.params.aid, u.id)
  if (u.status !== 'pending_activation') problem('already_activated')
  const h = handoff(u, 'subscriber')
  db.activationCodes = db.activationCodes.filter(c => c.userId !== u.id)
  db.activationCodes.push({ id: uid('activation-code', `${u.key}-${Date.now()}`), associationId: ctx.params.aid, userId: u.id, code: h.code, issuedAt: nowInstant(), expiresAt: h.expiresAt, handedAt: null })
  return h
}

function codeEntry(id: string) {
  const c = db.activationCodes.find(x => x.id === id) ?? problem('not_found')
  const u = userRow(c.userId)
  const state = c.expiresAt <= nowInstant() ? 'expired' as const : 'live' as const
  const ready = state === 'live' ? { ...handoff(u, 'subscriber', undefined, c.code), expiresAt: c.expiresAt } : null
  return { id: c.id, member: personContact(u), state, handoff: ready, issuedAt: c.issuedAt, handedAt: c.handedAt }
}

export function codesList(ctx: MockContext<'mb.codes', 'list'>) {
  const rows = db.activationCodes
    .filter(c => c.associationId === ctx.params.aid && (ctx.query.handed === undefined || Boolean(c.handedAt) === ctx.query.handed))
    .map(c => codeEntry(c.id))
  return page(rows, ctx.query)
}

export function codeHanded(ctx: MockContext<'mb.codes', 'markHanded'>) {
  const c = db.activationCodes.find(x => x.id === ctx.params.codeId && x.associationId === ctx.params.aid) ?? problem('not_found')
  c.handedAt ??= nowInstant()
  return codeEntry(c.id)
}
