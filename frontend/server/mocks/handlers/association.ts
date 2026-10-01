// Espace association : profil, moyens de paiement, onboarding, tableau de bord, abonnement, équipe, contrats.
import { createHash } from 'node:crypto'
import { db } from '../db'
import type { AssociationRow } from '../db'
import type { MockContext, MockSession } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { associationFigures, daysSince, enrollmentsOfProject, monthOf, projectFigures, today } from '../ledger'
import {
  association, associationRow, money, paymentMethodsOf, paymentSummary, personRef, projectRef, projectRow,
  projectSummary, publicPlan, planRow, userRow,
} from '../views'
import { handoff } from './handoff'
import { page } from './list'

/** Association de la session gestionnaire (le contrôle `aid` = session est fait par l'enveloppe). */
export function sessionAssociation(ctx: { session: MockSession | null }): AssociationRow {
  return associationRow(requireSession(ctx).associationId ?? problem('forbidden'))
}

export function associationGet(ctx: MockContext<'as.get', 'get'>) {
  return association(associationRow(ctx.params.aid))
}

export function associationPatch(ctx: MockContext<'as.patch', 'patch'>) {
  const a = associationRow(ctx.params.aid)
  checkVersion(ctx, a.version)
  Object.assign(a, ctx.body, { version: a.version + 1 })
  return association(a)
}

export function paymentMethodsList(ctx: MockContext<'as.pm', 'list'>) {
  return { items: paymentMethodsOf(ctx.params.aid) }
}

export function paymentMethodsReplace(ctx: MockContext<'as.pm', 'replace'>) {
  const aid = ctx.params.aid
  db.paymentMethods = [
    ...db.paymentMethods.filter(m => m.associationId !== aid),
    ...ctx.body.items.map((m, position) => ({
      id: m.id ?? uid('payment-method', `${aid}-${m.kind}-${position}-${Date.now()}`), associationId: aid, kind: m.kind, label: m.label,
      details: { ...m.details }, instructions: m.instructions ?? null, position, isActive: m.isActive,
    })),
  ]
  return { items: paymentMethodsOf(aid) }
}

export function onboardingComplete(ctx: MockContext<'as.onb', 'complete'>) {
  const a = associationRow(ctx.params.aid)
  if (!paymentMethodsOf(a.id).length) problem('onboarding_incomplete')
  Object.assign(a, { onboardingCompletedAt: a.onboardingCompletedAt ?? nowInstant(), status: a.status === 'onboarding' ? 'active' : a.status, version: a.version + 1 })
  return association(a)
}

// ---------------------------------------------------------------- Tableau de bord

/** Collecte reçue d'avril à août : barres de la maquette MgDashboard (septembre est calculé). */
const RECEIVED_BEFORE = [1_200_000, 1_250_000, 1_080_000, 1_000_000, 1_150_000]
/** Attendu mensuel de la maquette (52 souscripteurs × 25 000 F). */
const EXPECTED_MONTHLY = 1_300_000
/** Un contrat est « en souffrance » au-delà de 7 jours sans signature. */
const UNSIGNED_DAYS = 7

export function dashboard(ctx: MockContext<'as.dashboard', 'get'>) {
  const a = associationRow(ctx.params.aid)
  const f = associationFigures(a.id)
  const projects = db.projects.filter(p => p.associationId === a.id)
  const projectIds = new Set(projects.map(p => p.id))
  const month = monthOf(today())
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 6 + i, 1))
    return d.toISOString().slice(0, 10)
  })
  const unsigned = db.enrollments
    .filter(e => projectIds.has(e.projectId) && e.status === 'pending_signature' && daysSince(e.joinedAt) > UNSIGNED_DAYS)
    .map(e => ({ enrollmentId: e.id, member: personRef(userRow(e.userId)), project: projectRef(projectRow(e.projectId)), since: e.joinedAt }))
  const latest = db.payments
    .filter(p => p.associationId === a.id)
    .sort((x, y) => y.declaredAt.localeCompare(x.declaredAt))
    .slice(0, 5)
  return {
    collectedThisMonth: money(f.collectedThisMonth),
    expectedThisMonth: money(f.expectedThisMonth),
    paymentsToReview: { count: f.pendingPaymentsCount, oldestDeclaredAt: f.oldestPendingAt },
    lateSubscribers: { count: f.lateMembersCount, activeCount: f.membersCount },
    recoveryRate: f.recoveryRate,
    subscribersCount: f.membersCount,
    projectsCount: projects.length,
    activationCodesToHand: db.activationCodes.filter(c => c.associationId === a.id && !c.handedAt).length,
    unsignedContracts: unsigned,
    monthlyCollection: months.map((m, i) => i === months.length - 1
      ? { month: m, expected: money(f.expectedThisMonth), received: money(f.collectedThisMonth) }
      : { month: m, expected: money(EXPECTED_MONTHLY), received: money(RECEIVED_BEFORE[i] ?? 0) }),
    projects: projects
      .map(p => ({ p, late: projectFigures(p).lateSubscribersCount }))
      .sort((x, y) => y.late - x.late)
      .map(({ p }) => projectSummary(p)),
    latestPayments: latest.map(paymentSummary),
  }
}

// ---------------------------------------------------------------- Abonnement et factures

export function subscription(ctx: MockContext<'bl.sub', 'get'>) {
  const a = associationRow(ctx.params.aid)
  const s = db.subscriptions.find(x => x.associationId === a.id) ?? problem('not_found')
  const p = planRow(s.planId)
  const f = associationFigures(a.id)
  const managers = db.memberships.filter(m => m.associationId === a.id && m.role !== 'subscriber' && m.role !== 'owner' && m.status !== 'removed').length
  return {
    plan: publicPlan(p), billingPeriod: s.billingPeriod,
    status: ctx.scenario === 'suspendu' ? 'suspended' as const : s.status,
    price: money(s.billingPeriod === 'yearly' ? p.priceYearly : p.priceMonthly), currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd, trialEndsOn: s.trialEndsOn,
    quotas: {
      projects: { used: f.projectsCount, limit: p.limits.projects },
      subscribers: { used: f.membersCount, limit: p.limits.subscribers },
      managers: { used: managers, limit: a.managerSeatsOverride ?? p.limits.managers },
    },
  }
}

export function invoices(ctx: MockContext<'bl.inv', 'list'>) {
  let rows = db.invoices.filter(i => i.associationId === ctx.params.aid).sort((a, b) => b.periodStart.localeCompare(a.periodStart))
  // Échéance proche : facture d'octobre à régler avant le 5 ; suspendu : facture de septembre impayée.
  if (ctx.scenario === 'echeance-proche') rows = rows.map(i => (i.status === 'open' ? { ...i, dueAt: `${today()}T00:00:00Z` } : i))
  if (ctx.scenario === 'suspendu') rows = rows.map(i => (i.periodStart.startsWith(monthOf(today())) ? { ...i, status: 'overdue' as const, paidAt: null } : i))
  return page(rows.map(i => ({
    id: i.id, number: i.number, periodStart: i.periodStart, periodEnd: i.periodEnd, amount: money(i.amount), status: i.status,
    issuedAt: i.issuedAt, dueAt: i.dueAt, paidAt: i.paidAt, pdfFileId: null,
  })), ctx.query)
}

// ---------------------------------------------------------------- Équipe (V2)

function teamMember(associationId: string, userId: string) {
  const m = db.memberships.find(x => x.associationId === associationId && x.userId === userId && x.role !== 'subscriber')!
  const u = userRow(userId)
  return {
    member: { ...personRef(u), email: u.email ?? `${u.key}@entraide.example`, phone: u.phone },
    role: m.role as 'owner' | 'manager' | 'viewer', status: m.status, lastLoginAt: u.lastLoginAt ?? (m.status === 'active' ? '2026-09-24T18:40:00Z' : null),
  }
}

function seats(a: AssociationRow) {
  const used = db.memberships.filter(m => m.associationId === a.id && m.role !== 'subscriber' && m.role !== 'owner' && m.status !== 'removed').length
  return { used, limit: a.managerSeatsOverride ?? planRow(a.planId).limits.managers }
}

export function teamList(ctx: MockContext<'tm.team', 'list'>) {
  const a = associationRow(ctx.params.aid)
  const rows = db.memberships
    .filter(m => m.associationId === a.id && m.role !== 'subscriber' && m.status !== 'removed')
    .sort((x, y) => (x.role === 'owner' ? -1 : y.role === 'owner' ? 1 : x.joinedAt.localeCompare(y.joinedAt)))
  return { items: rows.map(m => teamMember(a.id, m.userId)), seats: seats(a) }
}

export function teamInvite(ctx: MockContext<'tm.team', 'invite'>) {
  const a = associationRow(ctx.params.aid)
  const s = seats(a)
  if (s.limit !== null && s.used >= s.limit) problem('quota_exceeded')
  const b = ctx.body
  if (db.users.some(u => u.email?.toLowerCase() === b.email.toLowerCase())) problem('validation_failed', { fields: { email: 'taken' } })
  const key = `invite-${b.email.toLowerCase()}`
  const id = uid('user', key)
  db.users.push({ id, key, firstName: b.firstName, lastName: b.lastName, phone: b.phone ?? null, email: b.email, status: 'pending_activation', locale: 'fr-CI', address: null, city: null, passwordChangedAt: null, lastLoginAt: null, version: 1 })
  db.memberships.push({ associationId: a.id, userId: id, role: b.role, status: 'invited', title: null, joinedAt: nowInstant() })
  return { member: teamMember(a.id, id), handoff: handoff(userRow(id), 'association', b.message) }
}

export function teamPatch(ctx: MockContext<'tm.team', 'patch'>) {
  const m = db.memberships.find(x => x.associationId === ctx.params.aid && x.userId === ctx.params.uid && x.role !== 'subscriber') ?? problem('not_found')
  if (m.role === 'owner' && ctx.body.role !== 'owner') problem('last_owner')
  m.role = ctx.body.role
  return teamMember(ctx.params.aid, ctx.params.uid)
}

export function teamRemove(ctx: MockContext<'tm.team', 'remove'>) {
  const m = db.memberships.find(x => x.associationId === ctx.params.aid && x.userId === ctx.params.uid && x.role !== 'subscriber' && x.status !== 'removed') ?? problem('not_found')
  if (m.role === 'owner') problem('last_owner')
  m.status = 'removed'
  return null
}

// ---------------------------------------------------------------- Contrats (V2)

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function contractOf(projectId: string) {
  return db.contracts.find(c => c.projectId === projectId) ?? problem('not_found')
}

export function projectContract(projectId: string) {
  const c = contractOf(projectId)
  const enrollments = enrollmentsOfProject(projectId)
  const unsigned = enrollments.filter(e => e.status === 'pending_signature')
  const extra = db.unlisted.find(u => u.scopeId === projectId)?.members ?? 0
  return {
    id: c.id, projectId, bodyTemplate: c.bodyTemplate, templateSha256: sha256(c.bodyTemplate),
    signer: { name: c.signerName, title: c.signerTitle }, associationSignedAt: c.associationSignedAt,
    associationSignedBy: c.associationSignedBy ? personRef(userRow(c.associationSignedBy)) : null, lockedAt: c.lockedAt,
    signatures: { signed: enrollments.length - unsigned.length + extra, total: enrollments.length + extra },
    unsigned: unsigned.map(e => ({ enrollmentId: e.id, member: personRef(userRow(e.userId)), enrolledAt: e.joinedAt })),
    pdfFileId: null,
  }
}

export function contractGet(ctx: MockContext<'ct.get', 'get'>) {
  projectRow(ctx.params.pid, ctx.params.aid)
  return projectContract(ctx.params.pid)
}

export function contractUpdate(ctx: MockContext<'ct.get', 'update'>) {
  projectRow(ctx.params.pid, ctx.params.aid)
  const c = contractOf(ctx.params.pid)
  if (c.lockedAt) problem('contract_locked')
  Object.assign(c, { bodyTemplate: ctx.body.bodyTemplate, signerName: ctx.body.signerName, signerTitle: ctx.body.signerTitle })
  return projectContract(ctx.params.pid)
}

export function contractLock(ctx: MockContext<'ct.get', 'lock'>) {
  projectRow(ctx.params.pid, ctx.params.aid)
  const c = contractOf(ctx.params.pid)
  if (c.lockedAt) problem('contract_locked')
  const now = nowInstant()
  Object.assign(c, { lockedAt: now, associationSignedAt: now, associationSignedBy: requireSession(ctx).userId })
  return projectContract(ctx.params.pid)
}

export function contractsList(ctx: MockContext<'ct.list', 'list'>) {
  if (ctx.scenario === 'aucun-contrat') return page([], ctx.query)
  const rows = db.contracts
    .filter(c => projectRow(c.projectId).associationId === ctx.params.aid)
    .map((c) => {
      const p = projectRow(c.projectId)
      const view = projectContract(p.id)
      const over7 = db.enrollments.filter(e => e.projectId === p.id && e.status === 'pending_signature' && daysSince(e.joinedAt) > UNSIGNED_DAYS).length
      return { project: projectRef(p), createdAt: c.createdAt, lockedAt: c.lockedAt, signed: view.signatures.signed, total: view.signatures.total, unsignedOver7Days: over7 }
    })
  return page(rows, ctx.query)
}
