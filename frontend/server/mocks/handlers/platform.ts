// Espace plateforme (super-admin) : onglets de la fiche d'une association, factures, personnel.
import { db } from '../db'
import type { AssociationRow } from '../db'
import type { MockContext } from '../http'
import { uid } from '../ids'
import { associationFigures, memberStandingIn as memberStandingFor, projectFigures } from '../ledger'
import {
  associationRow, money, personContact, personRef, planRef, planRow, userRow,
} from '../views'
import { page } from './list'

// ---------------------------------------------------------------- Associations

function ownerOf(a: AssociationRow) {
  const m = db.memberships.find(x => x.associationId === a.id && x.role === 'owner')
  return m ? userRow(m.userId) : null
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

// Plans (pub.plans, pf.plans, pf.plan.write, pf.plan.archive) : vrai back depuis le lot 1.2.

// Tableau de bord (pf.dashboard) : vrai back depuis le lot 1.4.

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
