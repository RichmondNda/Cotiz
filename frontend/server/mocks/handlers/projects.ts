// Projets d'une association : liste, création, aperçu de l'échéancier, paramètres, cycle de vie, vue d'ensemble, rapport.
import { DomainError, generateSchedule, lateSince } from '@cotiz/domain'
import { db } from '../db'
import type { ProjectRow } from '../db'
import type { MockContext } from '../http'
import { checkVersion, nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { enrollmentFigures, enrollmentsOfProject, projectFigures, scheduleFrom, sum, today } from '../ledger'
import { money, moneyOrNull, personRef, planRow, project, projectRow, projectSummary, userRow, associationRow } from '../views'
import { page } from './list'

/** Collecte reçue des 7 premières échéances de Centre communautaire : barres de la maquette MgProjet. */
const RECEIVED_RATIOS = [0.99, 0.97, 0.9, 0.86, 0.83, 0.8, 0.95]
/** Taux de recouvrement cumulé après chaque échéance : courbe de la maquette MgProjetRapports (100 % → 82 %). */
const RATE_CURVE = [1, 0.98, 0.95, 0.92, 0.89, 0.86, 0.82]

export function projectsList(ctx: MockContext<'pr.list', 'list'>) {
  if (ctx.scenario === 'vide') return page([], ctx.query)
  let rows = db.projects.filter(p => p.associationId === ctx.params.aid)
  if (ctx.query.status) rows = rows.filter(p => p.status === ctx.query.status)
  if (ctx.query.q) rows = rows.filter(p => p.name.toLowerCase().includes(ctx.query.q!.toLowerCase()))
  return page(rows.map(projectSummary), ctx.query)
}

function scheduleOrProblem(fn: () => ReturnType<typeof generateSchedule>) {
  try {
    return fn()
  }
  catch (e) {
    if (e instanceof DomainError) problem('validation_failed', { fields: { schedule: e.code } })
    throw e
  }
}

type Terms = MockContext<'pr.create', 'create'>['body']

function termsOf(b: Pick<Terms, 'entryFee' | 'installmentAmount' | 'frequency' | 'dueDay' | 'scheduleType' | 'startDate' | 'endDate'>) {
  return {
    entryFee: b.entryFee?.amount ?? null, installmentAmount: b.installmentAmount.amount, frequency: b.frequency,
    dueDay: b.dueDay, scheduleType: b.scheduleType, startDate: b.startDate, endDate: b.endDate,
  }
}

export function preview(ctx: MockContext<'pr.preview', 'preview'>) {
  const b = ctx.body
  const lines = scheduleOrProblem(() => generateSchedule({
    installmentAmount: b.installmentAmount.amount, entryFeeAmount: b.entryFee?.amount ?? null, frequency: b.frequency,
    dueDay: b.dueDay, scheduleType: b.scheduleType, startDate: b.startDate, endDate: b.endDate,
    enrolledFrom: b.enrolledFrom ?? null, horizon: b.horizon ?? null,
  }))
  return {
    installments: lines.map(l => ({ sequence: l.sequence, kind: l.kind, dueDate: l.dueDate, amountDue: money(l.amountDue) })),
    periodicCount: lines.filter(l => l.kind === 'periodic').length,
    totalPerSubscriber: b.scheduleType === 'fixed' ? money(sum(lines.map(l => l.amountDue))) : null,
  }
}

function checkQuota(associationId: string) {
  const a = associationRow(associationId)
  const limit = planRow(a.planId).limits.projects
  const active = db.projects.filter(p => p.associationId === associationId && p.status !== 'draft' && p.status !== 'completed' && p.status !== 'archived').length
  if (limit !== null && active >= limit) problem('quota_exceeded')
}

export function projectCreate(ctx: MockContext<'pr.create', 'create'>) {
  const b = ctx.body
  const aid = ctx.params.aid
  const terms = termsOf(b)
  scheduleOrProblem(() => generateSchedule({ ...terms, installmentAmount: terms.installmentAmount, entryFeeAmount: terms.entryFee }))
  const key = `${b.name}-${Date.now()}`
  const row: ProjectRow = {
    id: uid('project', key), key, associationId: aid, name: b.name, description: b.description, coverFileId: b.coverFileId ?? null,
    coverFileName: null, status: 'draft', ...terms, requiredSubscribers: b.requiredSubscribers, graceDays: b.graceDays,
    paymentMethods: b.paymentMethods.map(m => ({ ...m })), contractRequired: Boolean(b.contract), financialTermsLockedAt: null,
    closedAt: null, createdAt: nowInstant(), version: 1,
  }
  db.projects.push(row)
  if (b.contract) {
    const signed = b.contract.signNow ? nowInstant() : null
    db.contracts.push({
      id: uid('contract', key), projectId: row.id, bodyTemplate: b.contract.bodyTemplate, signerName: b.contract.signerName,
      signerTitle: b.contract.signerTitle, associationSignedAt: signed, associationSignedBy: signed ? requireSession(ctx).userId : null,
      lockedAt: signed, createdAt: nowInstant(),
    })
  }
  return project(row)
}

export function projectGet(ctx: MockContext<'pr.get', 'get'>) {
  return project(projectRow(ctx.params.pid, ctx.params.aid))
}

const FINANCIAL = ['entryFee', 'installmentAmount', 'frequency', 'dueDay', 'scheduleType', 'startDate', 'endDate'] as const

export function projectPatch(ctx: MockContext<'pr.patch', 'patch'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  checkVersion(ctx, p.version)
  const b = ctx.body
  if (p.financialTermsLockedAt && FINANCIAL.some(k => b[k] !== undefined)) problem('financial_terms_locked')
  if (p.status === 'completed' || p.status === 'archived') problem('invalid_state')
  Object.assign(p, {
    name: b.name ?? p.name, description: b.description ?? p.description,
    coverFileId: b.coverFileId === undefined ? p.coverFileId : b.coverFileId,
    requiredSubscribers: b.requiredSubscribers === undefined ? p.requiredSubscribers : b.requiredSubscribers,
    graceDays: b.graceDays ?? p.graceDays, paymentMethods: b.paymentMethods ? b.paymentMethods.map(m => ({ ...m })) : p.paymentMethods,
    ...(FINANCIAL.some(k => b[k] !== undefined)
      ? termsOf({ entryFee: b.entryFee === undefined ? moneyOrNull(p.entryFee) : b.entryFee, installmentAmount: b.installmentAmount ?? money(p.installmentAmount), frequency: b.frequency ?? p.frequency, dueDay: b.dueDay ?? p.dueDay, scheduleType: b.scheduleType ?? p.scheduleType, startDate: b.startDate ?? p.startDate, endDate: b.endDate === undefined ? p.endDate : b.endDate })
      : {}),
    version: p.version + 1,
  })
  return project(p)
}

export function projectPublish(ctx: MockContext<'pr.lifecycle', 'publish'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  if (p.status !== 'draft') problem('invalid_state')
  checkQuota(p.associationId)
  Object.assign(p, { status: 'enrolling', version: p.version + 1 })
  return project(p)
}

export function projectClose(ctx: MockContext<'pr.lifecycle', 'close'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  if (p.status !== 'enrolling' && p.status !== 'active') problem('invalid_state')
  Object.assign(p, { status: 'completed', closedAt: nowInstant(), version: p.version + 1 })
  // Échéances à venir annulées (opération compensatoire, rien n'est supprimé).
  for (const i of db.installments.filter(x => x.projectId === p.id && x.dueDate > today() && x.amountPaid === 0)) i.persistedStatus = 'canceled'
  for (const e of enrollmentsOfProject(p.id).filter(x => x.status === 'active')) e.status = 'completed'
  return project(p)
}

export function projectDuplicate(ctx: MockContext<'pr.lifecycle', 'duplicate'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  const key = `${p.key}-copie-${Date.now()}`
  const row: ProjectRow = { ...structuredClone(p), id: uid('project', key), key, name: `${p.name} (copie)`, status: 'draft', financialTermsLockedAt: null, closedAt: null, createdAt: nowInstant(), coverFileId: null, coverFileName: null, version: 1 }
  db.projects.push(row)
  return project(row)
}

export function projectDelete(ctx: MockContext<'pr.delete', 'remove'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  checkVersion(ctx, p.version)
  // Brouillon uniquement : dès qu'un projet a été publié, on le clôture (données financières jamais supprimées).
  if (p.status !== 'draft') problem('invalid_state')
  db.projects = db.projects.filter(x => x.id !== p.id)
  return null
}

// ---------------------------------------------------------------- Vue d'ensemble et rapport

function collectionBySequence(p: ProjectRow) {
  if (p.scheduleType !== 'fixed' || p.status === 'enrolling' || p.status === 'draft') return []
  const f = projectFigures(p)
  const full = f.recoveryRate === 1 || p.status === 'completed'
  return scheduleFrom(p)
    .filter(l => l.kind === 'periodic')
    .map((l, i) => {
      const expected = f.subscribersCount * l.amountDue
      const ratio = l.dueDate > today() ? 0 : full ? 1 : (RECEIVED_RATIOS[i] ?? 0)
      return { sequence: l.sequence, dueDate: l.dueDate, expected: money(expected), received: money(Math.round(expected * ratio)) }
    })
}

export function overview(ctx: MockContext<'pr.overview', 'get'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  const f = projectFigures(p)
  const enrollments = enrollmentsOfProject(p.id)
  const late = enrollments
    .map(e => ({ e, f: enrollmentFigures(e) }))
    .filter(x => x.f.lateCount > 0)
    .sort((a, b) => b.f.lateAmount - a.f.lateAmount || b.f.lateCount - a.f.lateCount)
  return {
    collected: money(f.collected),
    expectedToDate: money(f.expectedToDate),
    recoveryRate: f.recoveryRate,
    late: { count: f.lateSubscribersCount, amount: money(f.lateAmount) },
    nextDue: f.nextDueDate ? { dueDate: f.nextDueDate, expectedTotal: money(f.nextDueTotal) } : null,
    enrollment: { count: f.subscribersCount, required: p.requiredSubscribers },
    paymentsToReview: { count: f.pendingPaymentsCount, oldestDeclaredAt: f.oldestPendingAt },
    unsignedContracts: enrollments
      .filter(e => e.status === 'pending_signature')
      .map(e => ({ enrollmentId: e.id, member: personRef(userRow(e.userId)), enrolledAt: e.joinedAt })),
    collectionBySequence: collectionBySequence(p),
    lateMembers: late.map(({ e, f: lf }) => {
      const oldest = lf.installments.find(i => i.status === 'late')!
      return {
        member: personRef(userRow(e.userId)), enrollmentId: e.id, lateInstallments: lf.lateCount, amountDue: money(lf.lateAmount),
        lateSince: lateSince(oldest, p.graceDays), lateDueDates: lf.lateDueDates,
      }
    }),
  }
}

export function report(ctx: MockContext<'rp.report', 'get'>) {
  const p = projectRow(ctx.params.pid, ctx.params.aid)
  const f = projectFigures(p)
  const enrollments = enrollmentsOfProject(p.id)
  const periodic = scheduleFrom(p).filter(l => l.kind === 'periodic' && l.dueDate <= today())
  const full = f.recoveryRate === 1 || p.status === 'completed'
  const late = f.lateSubscribersCount
  const signatures = f.pendingSignaturesCount
  return {
    expected: money(f.expectedToDate),
    received: money(f.collected),
    remaining: money(Math.max(0, f.expectedToDate - f.collected)),
    recoveryRate: f.recoveryRate,
    collectionBySequence: collectionBySequence(p),
    recoveryRateBySequence: periodic.map((l, i) => ({ dueDate: l.dueDate, rate: full ? 1 : (RATE_CURVE[i] ?? f.recoveryRate ?? 0) })),
    standingCounts: { up_to_date: Math.max(0, f.subscribersCount - late), late, signature_required: signatures, withdrawn: 0, activation_pending: 0 },
    rows: enrollments.map((e) => {
      const ef = enrollmentFigures(e)
      const last = db.payments
        .filter(x => x.enrollmentId === e.id && x.status === 'validated')
        .sort((a, b) => b.paidOn.localeCompare(a.paidOn))[0]
      return {
        member: personRef(userRow(e.userId)), expectedToDate: money(ef.expectedToDate), paid: money(ef.paid),
        remaining: money(Math.max(0, ef.expectedToDate - ef.paid)), lateCount: ef.lateCount, lastPaymentOn: last?.paidOn ?? null,
      }
    }),
  }
}
