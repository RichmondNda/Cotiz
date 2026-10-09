// Espace plateforme (super-admin) : demandes, associations, plans, tableau de bord, factures, personnel.
// Les chiffres globaux de la plateforme (147 associations, 15 impayés…) sont illustratifs dans les maquettes : seules
// trois associations sont détaillées. Ils sont déclarés ici comme complément, à côté des trois associations calculées.
import type { Feature } from '@cotiz/contracts'
import { db } from '../db'
import type { AssociationRow, PlanRow, RequestRow } from '../db'
import type { MockContext } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { associationFigures, memberStandingIn as memberStandingFor, projectFigures } from '../ledger'
import {
  associationRow, money, personContact, personRef, plan, planRef, planRow, publicPlan, requestDetail, requestSummary, userRow,
} from '../views'
import { page, facetOf } from './list'
import { handoff } from './handoff'

// ---------------------------------------------------------------- Complément plateforme (illustratif)

/** Puces de SaAssociations : 148 associations dont 3 détaillées. */
const PLATFORM_COUNTS = { active: 132, past_due: 15, suspended: 0, onboarding: 1 }
const PLATFORM_KPI = { activeAssociations: 147, newAssociationsThisMonth: 6, subscriptionsUpToDate: 132, subscriptionsUnpaid: 15, totalAssociations: 147 }
/** Associations actives d'octobre 2025 à septembre 2026 (courbe de SaDashboard). */
const ACTIVE_BY_MONTH = [98, 102, 105, 110, 114, 120, 124, 130, 134, 138, 143, 147]

// ---------------------------------------------------------------- Demandes

function requestRow(id: string): RequestRow {
  return db.requests.find(r => r.id === id) ?? problem('not_found')
}

/** Scénarios de SaDemande : décision de la maquette (plan Essentiel, 2 comptes ; motif « Informations incomplètes »). */
function withDecisionScenario(r: RequestRow, scenario: string | undefined): RequestRow {
  if (scenario === 'approuvee') return { ...r, status: 'approved', decidedAt: '2026-09-25T10:00:00Z', decidedBy: uid('user', 'richy'), approvedPlanId: uid('plan', 'essentiel'), associationId: uid('association', r.key) }
  if (scenario === 'refusee') return { ...r, status: 'rejected', decidedAt: '2026-09-25T10:00:00Z', decidedBy: uid('user', 'richy'), rejectionReasonCode: 'incomplete' }
  return r
}

export function requestsList(ctx: MockContext<'pf.req.list', 'list'>) {
  const q = ctx.query
  let rows = [...db.requests].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  if (ctx.scenario === 'vide' || ctx.scenario === 'aucune-demande') rows = rows.filter(r => r.status !== 'pending')
  const all = rows
  if (q.status) rows = rows.filter(r => r.status === q.status)
  if (q.q) {
    const t = q.q.toLowerCase()
    rows = rows.filter(r => r.association.name.toLowerCase().includes(t) || r.contact.email.toLowerCase().includes(t))
  }
  if (q.desiredPlanId) rows = rows.filter(r => r.needs.desiredPlanId === q.desiredPlanId)
  return page(rows.map(requestSummary), q, { facets: facetOf(all, 'status', r => r.status) })
}

export function requestGet(ctx: MockContext<'pf.req.get', 'get'>) {
  const r = requestRow(ctx.params.id)
  // Première ouverture : la demande est marquée consultée (frise « Consultée par Richy »).
  if (!r.viewedAt) Object.assign(r, { viewedAt: nowInstant(), viewedBy: requireSession(ctx).userId })
  return requestDetail(withDecisionScenario(r, ctx.scenario))
}

export function requestApprove(ctx: MockContext<'pf.req.approve', 'approve'>) {
  const r = requestRow(ctx.params.id)
  if (r.status !== 'pending') problem('request_already_handled')
  planRow(ctx.body.planId)
  const associationId = uid('association', r.key)
  const ownerId = uid('user', `owner-${r.key}`)
  if (!db.associations.some(a => a.id === associationId)) {
    const now = nowInstant()
    db.associations.push({
      id: associationId, slug: r.key, name: r.association.name, type: r.association.type, city: r.association.city,
      country: r.association.country, description: r.association.activityDescription, logoFileId: null,
      contactEmail: r.contact.email, contactPhone: r.contact.phone, status: 'onboarding', currency: 'XOF', timezone: 'Africa/Abidjan',
      defaultGraceDays: 5, onboardingCompletedAt: null, planId: ctx.body.planId, managerSeatsOverride: ctx.body.managerSeats,
      createdAt: now, lastActivityAt: now, suspendedAt: null, suspensionReason: null, statusBeforeSuspension: null, version: 1,
    })
    db.subscriptions.push({
      id: uid('subscription', r.key), associationId, planId: ctx.body.planId, billingPeriod: ctx.body.billingPeriod ?? 'monthly',
      status: 'active', currentPeriodStart: ctx.body.subscriptionStartsOn, currentPeriodEnd: null, trialEndsOn: null,
    })
    db.users.push({ id: ownerId, key: `owner-${r.key}`, firstName: r.contact.firstName, lastName: r.contact.lastName, phone: r.contact.phone, email: r.contact.email, status: 'pending_activation', locale: 'fr-CI', address: null, city: null, passwordChangedAt: null, lastLoginAt: null, version: 1 })
    db.memberships.push({ associationId, userId: ownerId, role: 'owner', status: 'invited', title: r.contact.title, joinedAt: now })
  }
  Object.assign(r, {
    status: 'approved', decidedAt: nowInstant(), decidedBy: requireSession(ctx).userId, associationId,
    approvedPlanId: ctx.body.planId, internalNote: ctx.body.internalNote ?? r.internalNote,
  })
  return { request: requestDetail(r), associationId, handoff: handoff(userRow(ownerId), 'association', ctx.body.personalMessage) }
}

export function requestReject(ctx: MockContext<'pf.req.reject', 'reject'>) {
  const r = requestRow(ctx.params.id)
  if (r.status !== 'pending') problem('request_already_handled')
  Object.assign(r, { status: 'rejected', decidedAt: nowInstant(), decidedBy: requireSession(ctx).userId, rejectionReasonCode: ctx.body.reasonCode, rejectionMessage: ctx.body.message ?? null })
  return requestDetail(r)
}

// ---------------------------------------------------------------- Associations

function ownerOf(a: AssociationRow) {
  const m = db.memberships.find(x => x.associationId === a.id && x.role === 'owner')
  return m ? userRow(m.userId) : null
}

/** Scénario `etat-suspendue` (SaAssociation) : Entraide Yopougon suspendue, sans toucher au jeu. */
function withSuspendScenario(a: AssociationRow, scenario: string | undefined): AssociationRow {
  if (scenario !== 'etat-suspendue') return a
  return { ...a, status: 'suspended', suspendedAt: '2026-09-25T09:00:00Z', suspensionReason: 'Abonnement impayé depuis plus de 30 jours', statusBeforeSuspension: a.status }
}

function summary(a: AssociationRow) {
  const f = associationFigures(a.id)
  return {
    id: a.id, slug: a.slug, name: a.name, city: a.city, country: a.country, logoFileId: a.logoFileId, status: a.status,
    plan: planRef(planRow(a.planId)), projectsCount: f.projectsCount + (a.id === uid('association', 'ressortissants-man') ? 4 : 0),
    subscribersCount: f.membersCount, lastActivityAt: a.lastActivityAt, createdAt: a.createdAt,
  }
}

function managersQuota(a: AssociationRow) {
  const used = db.memberships.filter(m => m.associationId === a.id && m.role !== 'subscriber' && m.role !== 'owner' && m.status !== 'removed').length
  return { used, limit: a.managerSeatsOverride ?? planRow(a.planId).limits.managers }
}

export function platformDetail(a: AssociationRow) {
  const f = associationFigures(a.id)
  const p = planRow(a.planId)
  const sub = db.subscriptions.find(s => s.associationId === a.id)!
  const owner = ownerOf(a)
  const s = summary(a)
  return {
    ...s,
    type: a.type, description: a.description, contactEmail: a.contactEmail, contactPhone: a.contactPhone, currency: a.currency,
    timezone: a.timezone, suspendedAt: a.suspendedAt, suspensionReason: a.suspensionReason, onboardingCompletedAt: a.onboardingCompletedAt,
    owner: owner ? personContact(owner) : { id: uid('user', `owner-${a.slug}`), firstName: '[Responsable]', lastName: '', phone: null, email: null },
    managers: db.memberships
      .filter(m => m.associationId === a.id && m.role !== 'subscriber' && m.status !== 'removed')
      .map(m => ({ ...personContact(userRow(m.userId)), role: m.role as 'owner' | 'manager' | 'viewer' })),
    subscription: subscription(sub.id),
    quotas: {
      projects: { used: s.projectsCount, limit: p.limits.projects },
      subscribers: { used: s.subscribersCount, limit: p.limits.subscribers },
      managers: managersQuota(a),
    },
    kpi: {
      activeProjects: db.projects.filter(x => x.associationId === a.id && (x.status === 'active' || x.status === 'enrolling')).length + (s.projectsCount - f.projectsCount),
      subscribers: f.membersCount, collectedTotal: money(f.collected), recoveryRate: f.recoveryRate,
    },
    events: db.events
      .filter(e => e.scope === 'association' && e.scopeId === a.id)
      .sort((x, y) => y.at.localeCompare(x.at))
      .map(e => ({ type: e.type, at: e.at, by: e.by ? personRef(userRow(e.by)) : null, detail: e.detail })),
    version: a.version,
  }
}

function subscription(id: string) {
  const s = db.subscriptions.find(x => x.id === id)!
  const p = planRow(s.planId)
  const a = associationRow(s.associationId)
  return {
    id: s.id, plan: planRef(p), billingPeriod: s.billingPeriod, status: s.status,
    price: money(s.billingPeriod === 'yearly' ? p.priceYearly : p.priceMonthly), currentPeriodStart: s.currentPeriodStart,
    currentPeriodEnd: s.currentPeriodEnd, trialEndsOn: s.trialEndsOn, managerSeatsOverride: a.managerSeatsOverride,
  }
}

export function associationsList(ctx: MockContext<'pf.asso.list', 'list'>) {
  const q = ctx.query
  if (ctx.scenario === 'vide') return page([], q, { facets: { status: { ...PLATFORM_COUNTS } } })
  let rows = [...db.associations]
  if (q.status) rows = rows.filter(a => a.status === q.status)
  if (q.planId) rows = rows.filter(a => a.planId === q.planId)
  if (q.q) rows = rows.filter(a => a.name.toLowerCase().includes(q.q!.toLowerCase()))
  return page(rows.map(summary), q, { facets: { status: { ...PLATFORM_COUNTS } } })
}

export function associationGet(ctx: MockContext<'pf.asso.get', 'get'>) {
  return platformDetail(withSuspendScenario(associationRow(ctx.params.id), ctx.scenario))
}

export function associationCreate(ctx: MockContext<'pf.asso.create', 'create'>) {
  const b = ctx.body
  const slug = b.association.slug ?? b.association.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (db.associations.some(a => a.slug === slug)) problem('slug_taken')
  if (db.users.some(u => u.email?.toLowerCase() === b.owner.email.toLowerCase() && db.memberships.some(m => m.userId === u.id && m.role === 'owner'))) problem('email_already_owner')
  planRow(b.subscription.planId)
  const id = uid('association', slug)
  const ownerId = uid('user', `owner-${slug}`)
  const now = nowInstant()
  db.associations.push({
    id, slug, name: b.association.name, type: b.association.type, city: b.association.city, country: b.association.country,
    description: b.association.description ?? null, logoFileId: null, contactEmail: b.owner.email, contactPhone: b.owner.phone,
    status: 'onboarding', currency: 'XOF', timezone: 'Africa/Abidjan', defaultGraceDays: 5, onboardingCompletedAt: null,
    planId: b.subscription.planId, managerSeatsOverride: b.subscription.managerSeats, createdAt: now, lastActivityAt: now,
    suspendedAt: null, suspensionReason: null, statusBeforeSuspension: null, version: 1,
  })
  db.subscriptions.push({ id: uid('subscription', slug), associationId: id, planId: b.subscription.planId, billingPeriod: b.subscription.billingPeriod ?? 'monthly', status: b.subscription.trialDays ? 'trialing' : 'active', currentPeriodStart: b.subscription.startsOn, currentPeriodEnd: null, trialEndsOn: null })
  db.users.push({ id: ownerId, key: `owner-${slug}`, firstName: b.owner.firstName, lastName: b.owner.lastName, phone: b.owner.phone, email: b.owner.email, status: 'pending_activation', locale: 'fr-CI', address: null, city: null, passwordChangedAt: null, lastLoginAt: null, version: 1 })
  db.memberships.push({ associationId: id, userId: ownerId, role: 'owner', status: 'invited', title: null, joinedAt: now })
  return { association: platformDetail(associationRow(id)), handoff: b.issueCredentialsNow ? handoff(userRow(ownerId), 'association') : null }
}

export function associationPatch(ctx: MockContext<'pf.asso.patch', 'patch'>) {
  const a = associationRow(ctx.params.id)
  checkVersion(ctx, a.version)
  const { managerSeatsOverride, ...rest } = ctx.body
  Object.assign(a, rest, managerSeatsOverride === undefined ? {} : { managerSeatsOverride }, { version: a.version + 1 })
  return platformDetail(a)
}

export function associationSuspend(ctx: MockContext<'pf.asso.suspend', 'suspend'>) {
  const a = associationRow(ctx.params.id)
  if (a.status === 'suspended') problem('invalid_state')
  Object.assign(a, { statusBeforeSuspension: a.status, status: 'suspended', suspendedAt: nowInstant(), suspensionReason: ctx.body.reason, version: a.version + 1 })
  return platformDetail(a)
}

export function associationReactivate(ctx: MockContext<'pf.asso.suspend', 'reactivate'>) {
  const a = associationRow(ctx.params.id)
  if (a.status !== 'suspended') problem('invalid_state')
  Object.assign(a, { status: a.statusBeforeSuspension ?? 'active', statusBeforeSuspension: null, suspendedAt: null, suspensionReason: null, version: a.version + 1 })
  return platformDetail(a)
}

export function associationChangePlan(ctx: MockContext<'pf.asso.plan', 'changePlan'>) {
  const a = associationRow(ctx.params.id)
  const p = planRow(ctx.body.planId)
  const f = associationFigures(a.id)
  if (p.limits.projects !== null && f.projectsCount > p.limits.projects) problem('quota_exceeded')
  a.planId = p.id
  const s = db.subscriptions.find(x => x.associationId === a.id)!
  Object.assign(s, { planId: p.id, billingPeriod: ctx.body.billingPeriod ?? s.billingPeriod })
  return subscription(s.id)
}

export function associationProjects(ctx: MockContext<'pf.asso.sub', 'projects'>) {
  const a = associationRow(ctx.params.id)
  const rows = db.projects.filter(p => p.associationId === a.id).map((p) => {
    const f = projectFigures(p)
    return { id: p.id, name: p.name, status: p.status, subscribersCount: f.subscribersCount, collected: money(f.collected), createdAt: p.createdAt }
  })
  return page(rows, ctx.query, { total: summary(a).projectsCount })
}

export function associationMembers(ctx: MockContext<'pf.asso.sub', 'members'>) {
  const a = associationRow(ctx.params.id)
  const projectIds = new Set(db.projects.filter(p => p.associationId === a.id).map(p => p.id))
  const rows = db.memberships
    .filter(m => m.associationId === a.id && m.role === 'subscriber' && m.status !== 'removed')
    .map((m) => {
      const enrollments = db.enrollments.filter(e => e.userId === m.userId && projectIds.has(e.projectId) && e.status !== 'withdrawn')
      return { user: personContact(userRow(m.userId)), projectsCount: enrollments.length, standing: memberStandingFor(a.id, m.userId) }
    })
    .filter(r => !ctx.query.q || `${r.user.firstName} ${r.user.lastName}`.toLowerCase().includes(ctx.query.q.toLowerCase()))
  return page(rows, ctx.query, { total: associationFigures(a.id).membersCount })
}

// ---------------------------------------------------------------- Plans

export function plansList(ctx: MockContext<'pf.plans', 'list'>) {
  if (ctx.scenario === 'aucun-plan') return { items: [] }
  return { items: db.plans.map(plan) }
}

export function publicPlans(ctx: MockContext<'pub.plans', 'list'>) {
  if (ctx.scenario === 'aucun-plan') return { items: [] }
  return { items: db.plans.filter(p => p.isActive).map(publicPlan) }
}

export function planCreate(ctx: MockContext<'pf.plan.write', 'create'>) {
  const b = ctx.body
  if (db.plans.some(p => p.code === b.code)) problem('code_taken')
  const row: PlanRow = {
    id: uid('plan', b.code), code: b.code, name: b.name, description: b.description, priceMonthly: b.priceMonthly.amount,
    priceYearly: b.priceYearly.amount, limits: { ...b.limits }, features: [...b.features] as Feature[], isFeatured: b.isFeatured,
    isActive: b.isActive, archivedAt: null, subscribersCount: 0, version: 1,
  }
  db.plans.push(row)
  return plan(row)
}

export function planPatch(ctx: MockContext<'pf.plan.write', 'patch'>) {
  const p = planRow(ctx.params.id)
  checkVersion(ctx, p.version)
  const b = ctx.body
  if (b.code && b.code !== p.code && db.plans.some(x => x.code === b.code)) problem('code_taken')
  Object.assign(p, {
    code: b.code ?? p.code, name: b.name ?? p.name, description: b.description === undefined ? p.description : b.description,
    priceMonthly: b.priceMonthly?.amount ?? p.priceMonthly, priceYearly: b.priceYearly?.amount ?? p.priceYearly,
    limits: b.limits ? { ...b.limits } : p.limits, features: b.features ? [...b.features] : p.features,
    isFeatured: b.isFeatured ?? p.isFeatured, isActive: b.isActive ?? p.isActive,
    archivedAt: b.isActive === true ? null : p.archivedAt, version: p.version + 1,
  })
  return plan(p)
}

export function planArchive(ctx: MockContext<'pf.plan.archive', 'archive'>) {
  const p = planRow(ctx.params.id)
  if (!p.isActive) problem('invalid_state')
  Object.assign(p, { isActive: false, isFeatured: false, archivedAt: nowInstant(), version: p.version + 1 })
  return plan(p)
}

export function planDuplicate(ctx: MockContext<'pf.plan.archive', 'duplicate'>) {
  const p = planRow(ctx.params.id)
  let code = `${p.code}-copie`
  for (let i = 2; db.plans.some(x => x.code === code); i++) code = `${p.code}-copie-${i}`
  const row: PlanRow = { ...structuredClone(p), id: uid('plan', code), code, name: `${p.name} (copie)`, isFeatured: false, isActive: true, archivedAt: null, subscribersCount: 0, version: 1 }
  db.plans.push(row)
  return plan(row)
}

// ---------------------------------------------------------------- Tableau de bord

export function dashboard(ctx: MockContext<'pf.dashboard', 'get'>) {
  const pending = ctx.scenario === 'aucune-demande' ? [] : db.requests.filter(r => r.status === 'pending').sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const subscribers = db.associations.reduce((t, a) => t + associationFigures(a.id).membersCount, 0)
  const revenue = db.subscriptions.filter(s => s.status === 'active' || s.status === 'past_due').reduce((t, s) => t + planRow(s.planId).priceMonthly, 0)
  const man = associationRow(uid('association', 'ressortissants-man'))
  const bouake = associationRow(uid('association', 'jeunesse-bouake'))
  const entraide = associationRow(uid('association', 'entraide-yopougon'))
  return {
    pendingRequests: pending.length,
    oldestPendingRequests: pending.slice(0, 3).map(requestSummary),
    kpi: { ...PLATFORM_KPI, subscribers, monthlyRecurringRevenue: money(revenue) },
    activeAssociationsByMonth: ACTIVE_BY_MONTH.map((count, i) => ({ month: `${i < 3 ? 2025 : 2026}-${String(((9 + i) % 12) + 1).padStart(2, '0')}-01`, count })),
    associationsByPlan: db.plans.filter(p => p.isActive).map(p => ({ plan: planRef(p), count: p.subscribersCount })),
    watchlist: [
      { associationId: man.id, name: man.name, signal: 'unpaid' as const, since: '2026-09-05' },
      { associationId: bouake.id, name: bouake.name, signal: 'inactive' as const, since: '2026-09-24' },
      { associationId: entraide.id, name: entraide.name, signal: 'quota' as const, since: null },
    ],
    activity: [
      { type: 'association.created', at: '2026-09-24T09:00:00Z', associationId: bouake.id, associationName: bouake.name },
      { type: 'subscription.past_due', at: '2026-09-05T09:00:00Z', associationId: man.id, associationName: man.name },
      { type: 'plan.changed', at: '2025-06-01T09:00:00Z', associationId: entraide.id, associationName: entraide.name },
      { type: 'request.approved', at: '2026-09-24T09:00:00Z', associationId: bouake.id, associationName: bouake.name },
    ],
  }
}

// ---------------------------------------------------------------- Factures (V2) et personnel (V2)

const REVENUE = { revenueThisMonth: 0, collected: 0, pending: 0, overdue: 0 }

export function invoicesList(ctx: MockContext<'pf.invoices', 'list'>) {
  let rows = [...db.invoices].sort((a, b) => b.periodStart.localeCompare(a.periodStart))
  if (ctx.query.status) rows = rows.filter(i => i.status === ctx.query.status)
  if (ctx.query.associationId) rows = rows.filter(i => i.associationId === ctx.query.associationId)
  const sum = (s: string) => db.invoices.filter(i => i.status === s).reduce((t, i) => t + i.amount, 0)
  return {
    ...page(rows.map(i => ({
      id: i.id, number: i.number, association: { id: i.associationId, name: associationRow(i.associationId).name },
      periodStart: i.periodStart, periodEnd: i.periodEnd, amount: money(i.amount), status: i.status, issuedAt: i.issuedAt,
      dueAt: i.dueAt, paidAt: i.paidAt, paymentReference: i.paymentReference, pdfFileId: null,
    })), ctx.query),
    summary: {
      revenueThisMonth: money(REVENUE.revenueThisMonth + db.invoices.filter(i => i.periodStart.startsWith('2026-09')).reduce((t, i) => t + i.amount, 0)),
      collected: money(sum('paid')), pending: money(sum('open')), overdue: money(sum('overdue')),
    },
  }
}

export function staffList(_ctx: MockContext<'pf.staff', 'list'>) {
  return {
    items: db.staff.map((s) => {
      const u = userRow(s.userId)
      return { user: { ...personRef(u), email: u.email ?? `${u.key}@cotiz.example` }, role: s.role, status: s.status, lastLoginAt: s.status === 'active' && u.key === 'richy' ? '2026-09-25T09:02:00Z' : null }
    }),
  }
}
