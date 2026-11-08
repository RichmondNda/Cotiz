// Espace association : factures, équipe (profil, moyens, onboarding et abonnement : NestJS, lot 2.1 ; contrats : lot 4.1).
import { db } from '../db'
import type { AssociationRow } from '../db'
import type { MockContext, MockSession } from '../http'
import { nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { monthOf, today } from '../ledger'
import {
  associationRow, money, personRef, planRow, userRow,
} from '../views'
import { handoff } from './handoff'
import { page } from './list'

/** Association de la session gestionnaire (le contrôle `aid` = session est fait par l'enveloppe). */
export function sessionAssociation(ctx: { session: MockSession | null }): AssociationRow {
  return associationRow(requireSession(ctx).associationId ?? problem('forbidden'))
}

// ---------------------------------------------------------------- Abonnement et factures

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
    role: m.role as 'owner' | 'manager' | 'viewer', title: m.title, status: m.status, lastLoginAt: u.lastLoginAt ?? (m.status === 'active' ? '2026-09-24T18:40:00Z' : null),
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
