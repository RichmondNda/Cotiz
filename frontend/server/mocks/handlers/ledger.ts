// Registre : grille d'un projet, détail d'une échéance, file de validation, validation, rejet, annulation.
// Toute répartition est contrôlée par validateAllocation() de @cotiz/domain (domain-rules § 5), comme le back.
import { excludingPayment, validateAllocation } from '@cotiz/domain'
import type { AllocationIssue } from '@cotiz/domain'
import { db } from '../db'
import type { PaymentRow } from '../db'
import type { MockContext } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { daysSince, enrollmentFigures, enrollmentsOfProject, installmentView, ledgerInstallments, scheduleFrom } from '../ledger'
import { money, paymentDetail, paymentRow, paymentSummary, personRef, projectRef, projectRow, revertibleUntil, userRow } from '../views'
import { page } from './list'

// ---------------------------------------------------------------- Grille et échéance

export function grid(ctx: MockContext<'lg.grid', 'get'>) {
  const project = projectRow(ctx.params.pid, ctx.params.aid)
  const q = ctx.query
  const inPeriod = (d: string) => (!q.from || d >= q.from) && (!q.to || d <= q.to)
  let rows = enrollmentsOfProject(project.id).map((e) => {
    const f = enrollmentFigures(e)
    return {
      enrollmentId: e.id, member: personRef(userRow(e.userId)), standing: f.standing, remaining: money(f.remaining),
      cells: f.installments.filter(i => inPeriod(i.dueDate)).map(i => ({
        installmentId: i.id, sequence: i.sequence, status: i.status, amountDue: money(i.amountDue),
        amountPaid: money(i.amountPaid), amountPending: money(i.amountPending),
      })),
    }
  })
  if (q.standing) rows = rows.filter(r => r.standing === q.standing)
  if (q.q) rows = rows.filter(r => `${r.member.firstName} ${r.member.lastName}`.toLowerCase().includes(q.q!.toLowerCase()))
  const extra = db.unlisted.find(u => u.scopeId === project.id)?.activeMembers ?? 0
  const columns = scheduleFrom(project).filter(l => inPeriod(l.dueDate)).map(l => ({ sequence: l.sequence, kind: l.kind, dueDate: l.dueDate }))
  return { ...page(rows, q, { total: q.standing || q.q ? 0 : rows.length + extra }), columns }
}

export function installmentGet(ctx: MockContext<'lg.inst', 'get'>) {
  const row = db.installments.find(i => i.id === ctx.params.iid) ?? problem('not_found')
  const project = projectRow(row.projectId, ctx.params.aid)
  const enrollment = db.enrollments.find(e => e.id === row.enrollmentId)!
  const i = installmentView(row)
  return {
    installment: {
      id: i.id, enrollmentId: i.enrollmentId, projectId: i.projectId, kind: i.kind, sequence: i.sequence, dueDate: i.dueDate,
      amountDue: money(i.amountDue), amountPaid: money(i.amountPaid), amountPending: money(i.amountPending),
      remaining: money(Math.max(0, i.remaining)), status: i.status, lateSince: i.lateSince, paidAt: i.paidAt,
    },
    member: personRef(userRow(enrollment.userId)),
    project: projectRef(project),
    allocations: db.allocations.filter(a => a.installmentId === row.id).map((a) => {
      const p = db.payments.find(x => x.id === a.paymentId)!
      return { paymentId: p.id, amount: money(a.amount), state: a.state, paymentStatus: p.status, paidOn: p.paidOn, declaredAt: p.declaredAt }
    }),
  }
}

// ---------------------------------------------------------------- File et détail

export function paymentsList(ctx: MockContext<'lg.pay.list', 'list'>) {
  const q = ctx.query
  let rows = db.payments.filter(p => p.associationId === ctx.params.aid)
  if (q.status !== 'all') rows = rows.filter(p => p.status === q.status)
  if (q.projectId) rows = rows.filter(p => p.projectId === q.projectId)
  if (q.userId) rows = rows.filter(p => p.userId === q.userId)
  if (q.olderThanDays !== undefined) rows = rows.filter(p => daysSince(p.declaredAt) >= q.olderThanDays!)
  if (q.minAmount !== undefined) rows = rows.filter(p => p.amountDeclared >= q.minAmount!)
  if (q.maxAmount !== undefined) rows = rows.filter(p => p.amountDeclared <= q.maxAmount!)
  rows.sort((a, b) => b.declaredAt.localeCompare(a.declaredAt))
  return page(rows.map(paymentSummary), q)
}

export function paymentGet(ctx: MockContext<'lg.pay.get', 'get'>) {
  return paymentDetail(paymentRow(ctx.params.payId, ctx.params.aid))
}

// ---------------------------------------------------------------- Validation, rejet, annulation

/** Première erreur de validateAllocation → code du catalogue (errors.yaml). */
export function allocationProblem(errors: AllocationIssue[]): never {
  const exceeds = errors.find(e => e.code === 'allocation_exceeds_remaining')
  if (exceeds) problem('allocation_exceeds_remaining', { installmentId: exceeds.installmentId, remaining: exceeds.remaining })
  const mismatch = errors.find(e => e.code === 'allocation_mismatch')
  if (mismatch) problem('allocation_mismatch', { expected: mismatch.expected, allocated: mismatch.allocated })
  problem('validation_failed', { fields: Object.fromEntries(errors.map(e => ['installmentId' in e ? `allocations.${e.installmentId}` : 'allocations', e.code])) })
}

function pendingOrProblem(p: PaymentRow) {
  if (p.status === 'pending') return
  const by = p.reviewedBy ? userRow(p.reviewedBy) : null
  // Détails du catalogue (`reviewerName`, statut) ; le statut du paiement prend le nom `paymentStatus` : `status` est
  // le code HTTP dans un Problem (RFC 9457).
  problem('payment_already_reviewed', { reviewerName: by ? `${by.firstName} ${by.lastName}`.trim() : null, paymentStatus: p.status })
}

export function paymentValidate(ctx: MockContext<'lg.pay.validate', 'validate'>) {
  const p = paymentRow(ctx.params.payId, ctx.params.aid)
  pendingOrProblem(p)
  checkVersion(ctx, p.version)
  const own = db.allocations.filter(a => a.paymentId === p.id && a.state === 'proposed').map(a => ({ installmentId: a.installmentId, amount: a.amount }))
  const allocations = ctx.body.allocations?.map(a => ({ installmentId: a.installmentId, amount: a.amount.amount })) ?? own
  const received = ctx.body.amountReceived?.amount ?? p.amountDeclared
  const result = validateAllocation(received, allocations, excludingPayment(ledgerInstallments(p.enrollmentId), own), { enrollmentId: p.enrollmentId })
  if (!result.ok) allocationProblem(result.errors)

  const now = nowInstant()
  // Propositions annulées (jamais supprimées, règle 8), allocations confirmées créées, payé crédité.
  for (const a of db.allocations.filter(x => x.paymentId === p.id && x.state === 'proposed')) a.state = 'voided'
  for (const a of allocations) {
    db.allocations.push({ paymentId: p.id, installmentId: a.installmentId, amount: a.amount, state: 'confirmed' })
    const i = db.installments.find(x => x.id === a.installmentId)!
    i.amountPaid += a.amount
    if (i.amountPaid >= i.amountDue) i.paidAt ??= now
  }
  const adjusted = JSON.stringify([...allocations].sort((x, y) => x.installmentId.localeCompare(y.installmentId)))
    !== JSON.stringify([...own].sort((x, y) => x.installmentId.localeCompare(y.installmentId)))
  Object.assign(p, {
    status: 'validated', amountReceived: received === p.amountDeclared ? null : received, reviewedBy: requireSession(ctx).userId,
    reviewedAt: now, allocationAdjusted: adjusted, version: p.version + 1,
  })
  revertibleUntil.set(p.id, Date.now() + 10 * 60 * 1000)
  // Premier paiement validé : conditions financières du projet verrouillées (architecture/04-flows.md § 4.5).
  const project = projectRow(p.projectId)
  project.financialTermsLockedAt ??= now
  return paymentDetail(p)
}

export function paymentReject(ctx: MockContext<'lg.pay.reject', 'reject'>) {
  const p = paymentRow(ctx.params.payId, ctx.params.aid)
  pendingOrProblem(p)
  checkVersion(ctx, p.version)
  for (const a of db.allocations.filter(x => x.paymentId === p.id && x.state === 'proposed')) a.state = 'voided'
  Object.assign(p, {
    status: 'rejected', reviewedBy: requireSession(ctx).userId, reviewedAt: nowInstant(),
    rejection: { reasonCode: ctx.body.reasonCode, message: ctx.body.message ?? null }, version: p.version + 1,
  })
  return paymentDetail(p)
}

export function paymentRevert(ctx: MockContext<'lg.pay.revert', 'revert'>) {
  const p = paymentRow(ctx.params.payId, ctx.params.aid)
  if (p.status !== 'validated') problem('invalid_state')
  if (p.reviewedBy !== requireSession(ctx).userId) problem('not_reviewer')
  if ((revertibleUntil.get(p.id) ?? 0) < Date.now()) problem('revert_window_expired')
  // Opération compensatoire (04-flows § 4.5) : allocations confirmées annulées et payé décrédité, puis la répartition
  // déclarée par le souscripteur est reproposée (Σ = montant déclaré), quel qu'ait été l'ajustement du gestionnaire.
  for (const a of db.allocations.filter(x => x.paymentId === p.id && x.state === 'confirmed')) {
    const i = db.installments.find(x => x.id === a.installmentId)!
    i.amountPaid -= a.amount
    if (i.amountPaid < i.amountDue) i.paidAt = null
    a.state = 'voided'
  }
  for (const a of p.declaredAllocations) db.allocations.push({ paymentId: p.id, installmentId: a.installmentId, amount: a.amount, state: 'proposed' })
  Object.assign(p, { status: 'pending', amountReceived: null, reviewedBy: null, reviewedAt: null, allocationAdjusted: false, version: p.version + 1 })
  revertibleUntil.delete(p.id)
  return paymentDetail(p)
}
