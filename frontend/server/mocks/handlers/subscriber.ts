// Espace souscripteur (tableau de bord et projets : NestJS depuis le lot 3.2) : aperçu et déclaration d'un paiement, historique, contrats, associations.
import { createHash } from 'node:crypto'
import { DomainError, formatMoney, previewAllocation, validateAllocation } from '@cotiz/domain'
import type { AllocationIssue } from '@cotiz/domain'
import { formatTelephone } from '../../../app/utils/format'
import { db } from '../db'
import type { EnrollmentRow, PaymentRow } from '../db'
import type { MockContext } from '../http'
import { nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { enrollmentFigures, ledgerInstallments, monthOf, openTotal, scheduleFrom, subscriberTotals, sum } from '../ledger'
import { signEnrollment } from '../scenarios'
import {
  associationRef, associationRow, enrollmentsOfUser, money, moneyOrNull, paymentMethodsOf, projectRef, projectRow,
  subscriberPayment, subscriberProjectCard, userRow,
} from '../views'
import { uploads } from './imports'
import { page } from './list'

function myEnrollment(userId: string, projectId: string): EnrollmentRow {
  return db.enrollments.find(e => e.userId === userId && e.projectId === projectId && e.status !== 'withdrawn') ?? problem('not_found')
}

function myPayments(userId: string) {
  return db.payments.filter(p => p.userId === userId).sort((a, b) => b.declaredAt.localeCompare(a.declaredAt))
}

// ---------------------------------------------------------------- Déclaration

export function allocationPreview(ctx: MockContext<'me.alloc', 'preview'>) {
  const e = myEnrollment(requireSession(ctx).userId, ctx.body.projectId)
  const installments = ledgerInstallments(e.id)
  try {
    const { allocations, remainingAfter } = previewAllocation(ctx.body.amount.amount, installments)
    return {
      allocations: allocations.map(a => ({ installmentId: a.installmentId, amount: money(a.amount) })),
      remainingAfter: money(remainingAfter),
    }
  }
  catch (err) {
    if (err instanceof DomainError && err.code === 'amount_exceeds_remaining') problem('amount_exceeds_remaining', { maxAmount: err.details.maxAmount })
    if (err instanceof DomainError) problem('validation_failed', { fields: { amount: err.code } })
    throw err
  }
}

export function declare(ctx: MockContext<'me.declare', 'declare'>) {
  const userId = requireSession(ctx).userId
  const b = ctx.body
  const e = myEnrollment(userId, b.projectId)
  if (e.status === 'pending_signature') problem('signature_required')
  if (e.status !== 'active') problem('invalid_state')
  const p = projectRow(e.projectId)
  const installments = ledgerInstallments(e.id)
  const maxAmount = openTotal(installments)
  if (b.amount.amount > maxAmount) problem('amount_exceeds_remaining', { maxAmount })
  const allocations = b.allocations.map(a => ({ installmentId: a.installmentId, amount: a.amount.amount }))
  const result = validateAllocation(b.amount.amount, allocations, installments, { enrollmentId: e.id })
  if (!result.ok) allocationProblem(result.errors)
  const method = b.paymentMethodId ? db.paymentMethods.find(m => m.id === b.paymentMethodId && m.associationId === p.associationId) ?? problem('validation_failed', { fields: { paymentMethodId: 'unknown' } }) : null
  const file = b.proofFileId ? uploads.get(b.proofFileId) ?? problem('validation_failed', { fields: { proofFileId: 'unknown' } }) : null
  const id = uid('payment', `${userId}-${Date.now()}-${Math.random()}`)
  const row: PaymentRow = {
    id, associationId: p.associationId, projectId: p.id, enrollmentId: e.id, userId, amountDeclared: b.amount.amount,
    amountReceived: null, paidOn: b.paidOn, paymentMethodId: method?.id ?? null, paymentMethodKind: method?.kind ?? null,
    proof: { fileId: b.proofFileId ?? null, fileName: file?.fileName ?? null, mimeType: file?.mimeType ?? null, transactionReference: b.transactionReference ?? null },
    comment: b.comment ?? null, status: 'pending', declaredAt: nowInstant(), reviewedBy: null, reviewedAt: null, rejection: null,
    allocationAdjusted: false, declaredAllocations: allocations.map(a => ({ ...a })), version: 1,
  }
  db.payments.push(row)
  for (const a of allocations) db.allocations.push({ paymentId: id, installmentId: a.installmentId, amount: a.amount, state: 'proposed' })
  return subscriberPayment(row)
}

export function paymentGet(ctx: MockContext<'me.payment', 'get'>) {
  const userId = requireSession(ctx).userId
  const p = db.payments.find(x => x.id === ctx.params.id && x.userId === userId) ?? problem('not_found')
  const method = p.paymentMethodId ? paymentMethodsOf(p.associationId).find(m => m.id === p.paymentMethodId) ?? null : null
  return { ...subscriberPayment(p), paymentMethod: method, comment: p.comment }
}

// ---------------------------------------------------------------- Historique

function historyRows(ctx: { session: Parameters<typeof requireSession>[0]['session'] }, q: { associationId?: string, projectId?: string, from?: string, to?: string }) {
  return myPayments(requireSession(ctx).userId)
    .filter(p => (!q.associationId || p.associationId === q.associationId) && (!q.projectId || p.projectId === q.projectId))
    .filter(p => (!q.from || p.paidOn >= q.from) && (!q.to || p.paidOn <= q.to))
}

export function history(ctx: MockContext<'me.history', 'list'>) {
  const rows = historyRows(ctx, ctx.query)
  const validated = rows.filter(p => p.status === 'validated')
  const t = subscriberTotals(requireSession(ctx).userId)
  return {
    ...page(rows.map(subscriberPayment), ctx.query),
    summary: { totalPaid: money(sum(validated.map(p => p.amountReceived ?? p.amountDeclared))), paymentsCount: validated.length, remaining: money(t.remainingTotal) },
  }
}

export function historySeries(ctx: MockContext<'me.history', 'series'>) {
  const userId = requireSession(ctx).userId
  const rows = historyRows(ctx, ctx.query).filter(p => p.status === 'validated')
  const months = [...new Set(rows.map(p => `${monthOf(p.paidOn)}-01`))].sort()
  let running = 0
  const engaged = db.enrollments.filter(e => e.userId === userId && e.status === 'active')
  return {
    cumulative: months.map((m) => {
      running += sum(rows.filter(p => monthOf(p.paidOn) === m.slice(0, 7)).map(p => p.amountReceived ?? p.amountDeclared))
      return { month: m, paid: money(running) }
    }),
    target: money(sum(engaged.map(e => enrollmentFigures(e).commitment ?? 0))),
    byMonth: months.map(m => ({
      month: m,
      projects: [...new Set(rows.map(p => p.projectId))].map(projectId => ({
        projectId, paid: money(sum(rows.filter(p => p.projectId === projectId && monthOf(p.paidOn) === m.slice(0, 7)).map(p => p.amountReceived ?? p.amountDeclared))),
      })),
    })),
  }
}

// ---------------------------------------------------------------- Contrats

const FREQUENCY_WORDS = { weekly: 'hebdomadaires', monthly: 'mensuelles', quarterly: 'trimestrielles', semiannual: 'semestrielles', annual: 'annuelles' } as const
const CONSENT = 'J’ai lu le contrat et je l’accepte. Je reconnais que ma signature électronique a la même valeur qu’une signature manuscrite.'
const F = (amount: number) => formatMoney({ amount, currency: 'XOF' })
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex')

function contractView(e: EnrollmentRow) {
  const p = projectRow(e.projectId)
  const a = associationRow(p.associationId)
  const c = db.contracts.find(x => x.projectId === p.id) ?? problem('not_found')
  const u = userRow(e.userId)
  const lines = scheduleFrom(p, e.startsFrom)
  const periodic = lines.filter(l => l.kind === 'periodic').length
  const total = sum(lines.map(l => l.amountDue))
  const values: Record<string, string> = {
    association: a.name, nom_souscripteur: `${u.firstName} ${u.lastName}`, telephone: u.phone ? formatTelephone(u.phone) : '+225 [XX XX XX XX]',
    projet: p.name, montant: F(total), fonds_entree: F(p.entryFee ?? 0), nb_echeances: String(periodic),
    frequence: FREQUENCY_WORDS[p.frequency], montant_echeance: F(p.installmentAmount), jour: String(p.dueDay),
  }
  const body = c.bodyTemplate.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all)
  return {
    project: projectRef(p), association: associationRef(a),
    commitment: { entryFee: moneyOrNull(p.entryFee), installmentAmount: money(p.installmentAmount), frequency: p.frequency, periodicCount: p.scheduleType === 'fixed' ? periodic : null, total: p.scheduleType === 'fixed' ? money(total) : null },
    body, renderedSha256: sha256(body),
    associationSigner: { name: c.signerName, title: c.signerTitle, signedAt: c.associationSignedAt },
    consentText: CONSENT, signedAt: e.contractSignedAt, pdfFileId: null,
  }
}

export function contractGet(ctx: MockContext<'me.contract', 'get'>) {
  return contractView(myEnrollment(requireSession(ctx).userId, ctx.params.pid))
}

export function contractSign(ctx: MockContext<'me.sign', 'sign'>) {
  const e = myEnrollment(requireSession(ctx).userId, ctx.params.pid)
  if (e.contractSignedAt) problem('already_signed')
  if (contractView(e).renderedSha256 !== ctx.body.renderedSha256) problem('contract_changed')
  signEnrollment(db, e, nowInstant())
  return contractView(e)
}

export function contractsList(ctx: MockContext<'me.contracts', 'list'>) {
  if (ctx.scenario === 'aucun-contrat') return { items: [] }
  const userId = requireSession(ctx).userId
  const items = db.enrollments
    .filter(e => e.userId === userId && e.status !== 'withdrawn' && db.contracts.some(c => c.projectId === e.projectId) && projectRow(e.projectId).contractRequired)
    .map((e) => {
      const p = projectRow(e.projectId)
      return { project: projectRef(p), association: associationRef(associationRow(p.associationId)), status: e.contractSignedAt ? 'signed' as const : 'to_sign' as const, signedAt: e.contractSignedAt, pdfFileId: null }
    })
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'to_sign' ? -1 : 1))
  return { items }
}

// ---------------------------------------------------------------- Associations

export function associationsList(ctx: MockContext<'me.assos', 'list'>) {
  const userId = requireSession(ctx).userId
  const memberships = db.memberships.filter(m => m.userId === userId && m.role === 'subscriber' && m.status !== 'removed')
  return {
    items: memberships.map((m) => {
      const a = associationRow(m.associationId)
      const enrollments = enrollmentsOfUser(userId).filter(e => projectRow(e.projectId).associationId === a.id)
      const engaged = enrollments.filter(e => e.status === 'active' || e.status === 'completed').map(enrollmentFigures)
      const standings = enrollments.map(e => enrollmentFigures(e).standing)
      return {
        association: { ...associationRef(a), city: a.city },
        memberSince: enrollments.map(e => e.joinedAt).sort()[0] ?? m.joinedAt,
        activeProjects: enrollments.filter(e => projectRow(e.projectId).status !== 'completed').length,
        remaining: money(sum(engaged.map(f => f.remaining))),
        standing: standings.includes('late') ? 'late' as const : standings.includes('signature_required') ? 'signature_required' as const : 'up_to_date' as const,
      }
    }).sort((x, y) => x.memberSince.localeCompare(y.memberSince)),
  }
}

export function associationGet(ctx: MockContext<'me.assos', 'get'>) {
  const userId = requireSession(ctx).userId
  if (!db.memberships.some(m => m.userId === userId && m.associationId === ctx.params.aid && m.role === 'subscriber')) problem('not_found')
  const a = associationRow(ctx.params.aid)
  return {
    association: { ...associationRef(a), city: a.city, country: a.country, description: a.description, contactEmail: a.contactEmail, contactPhone: a.contactPhone },
    projects: enrollmentsOfUser(userId).filter(e => projectRow(e.projectId).associationId === a.id).map(subscriberProjectCard),
    paymentMethods: paymentMethodsOf(a.id),
  }
}

// Répartition refusée par validateAllocation() (le registre gestionnaire est servi par NestJS depuis le lot 2.4).
/** Première erreur de validateAllocation → code du catalogue (errors.yaml). */
export function allocationProblem(errors: AllocationIssue[]): never {
  const exceeds = errors.find(e => e.code === 'allocation_exceeds_remaining')
  if (exceeds) problem('allocation_exceeds_remaining', { installmentId: exceeds.installmentId, remaining: exceeds.remaining })
  const mismatch = errors.find(e => e.code === 'allocation_mismatch')
  if (mismatch) problem('allocation_mismatch', { expected: mismatch.expected, allocated: mismatch.allocated })
  problem('validation_failed', { fields: Object.fromEntries(errors.map(e => ['installmentId' in e ? `allocations.${e.installmentId}` : 'allocations', e.code])) })
}
