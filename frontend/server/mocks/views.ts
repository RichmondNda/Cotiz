// Formes de réponse du contrat (@cotiz/contracts) construites à partir des tables du jeu simulé.
// Aucune règle métier ici : les chiffres viennent de ledger.ts (donc de @cotiz/domain).
import type { z } from 'zod'
import type {
  Association, Enrollment, Installment, Notification, PaymentDetail, PaymentMethod, PaymentSummary, PersonContact,
  PersonRef, Project, ProjectSummary, PublicPlan, SubscriberPayment, SubscriberProjectCard,
} from '@cotiz/contracts'
import { db } from './db'
import type { AssociationRow, EnrollmentRow, NotificationRow, PaymentRow, PlanRow, ProjectRow, UserRow } from './db'
import { enrollmentFigures, installmentView, projectFigures, projectById, today } from './ledger'
import type { InstallmentView } from './ledger'
import { problem } from './http'

type In<T extends z.ZodType> = z.input<T>
export type Money = { amount: number, currency: 'XOF' }

export const money = (amount: number): Money => ({ amount, currency: 'XOF' })
export const moneyOrNull = (amount: number | null | undefined): Money | null => (amount == null ? null : money(amount))

// ---------------------------------------------------------------- Accès aux lignes (404 si absent)

export function userRow(id: string): UserRow {
  return db.users.find(u => u.id === id) ?? problem('not_found')
}
export function associationRow(id: string): AssociationRow {
  return db.associations.find(a => a.id === id) ?? problem('not_found')
}
export function projectRow(id: string, associationId?: string): ProjectRow {
  const p = projectById(id)
  if (!p || (associationId && p.associationId !== associationId)) problem('not_found')
  return p
}
export function planRow(id: string): PlanRow {
  return db.plans.find(p => p.id === id) ?? problem('not_found')
}
export function paymentRow(id: string, associationId?: string): PaymentRow {
  const p = db.payments.find(x => x.id === id)
  if (!p || (associationId && p.associationId !== associationId)) problem('not_found')
  return p
}

// ---------------------------------------------------------------- Personnes, références

export const personRef = (u: UserRow): In<typeof PersonRef> => ({ id: u.id, firstName: u.firstName, lastName: u.lastName })
export const personContact = (u: UserRow): In<typeof PersonContact> => ({ ...personRef(u), phone: u.phone, email: u.email })
export const personRefById = (id: string | null) => (id ? personRef(userRow(id)) : null)
export const projectRef = (p: ProjectRow) => ({ id: p.id, name: p.name })
export const associationRef = (a: AssociationRow) => ({ id: a.id, name: a.name, logoFileId: a.logoFileId })
export const planRef = (p: PlanRow) => ({ id: p.id, code: p.code, name: p.name })
export const fullName = (u: UserRow) => [u.firstName, u.lastName].filter(Boolean).join(' ')

// ---------------------------------------------------------------- Plans

export function publicPlan(p: PlanRow): In<typeof PublicPlan> {
  return {
    id: p.id, code: p.code, name: p.name, description: p.description, priceMonthly: money(p.priceMonthly),
    priceYearly: money(p.priceYearly), limits: { ...p.limits }, features: [...p.features], isFeatured: p.isFeatured,
  }
}

// ---------------------------------------------------------------- Association

export function association(a: AssociationRow): In<typeof Association> {
  return {
    id: a.id, slug: a.slug, name: a.name, type: a.type, city: a.city, country: a.country, description: a.description,
    logoFileId: a.logoFileId, contactEmail: a.contactEmail, contactPhone: a.contactPhone, status: a.status, currency: a.currency,
    timezone: a.timezone, defaultGraceDays: a.defaultGraceDays, onboardingCompletedAt: a.onboardingCompletedAt, version: a.version,
  }
}

export function paymentMethodsOf(associationId: string): In<typeof PaymentMethod>[] {
  return db.paymentMethods
    .filter(m => m.associationId === associationId)
    .sort((a, b) => a.position - b.position)
    .map(m => ({ id: m.id, kind: m.kind, label: m.label, details: { ...m.details }, instructions: m.instructions, position: m.position, isActive: m.isActive }))
}

// ---------------------------------------------------------------- Projets

export function projectStats(p: ProjectRow) {
  const f = projectFigures(p)
  return {
    subscribersCount: f.subscribersCount, collected: money(f.collected), expectedToDate: money(f.expectedToDate),
    recoveryRate: f.recoveryRate, progress: f.progress, lateSubscribersCount: f.lateSubscribersCount,
    pendingPaymentsCount: f.pendingPaymentsCount, pendingSignaturesCount: f.pendingSignaturesCount, nextDueDate: f.nextDueDate,
    installmentsCount: f.installmentsCount, totalPerSubscriber: moneyOrNull(f.totalPerSubscriber),
  }
}

export function projectSummary(p: ProjectRow): In<typeof ProjectSummary> {
  return {
    id: p.id, name: p.name, coverFileId: p.coverFileId, coverFileName: p.coverFileName, status: p.status,
    entryFee: moneyOrNull(p.entryFee), installmentAmount: money(p.installmentAmount), frequency: p.frequency, dueDay: p.dueDay,
    scheduleType: p.scheduleType, startDate: p.startDate, endDate: p.endDate, requiredSubscribers: p.requiredSubscribers,
    graceDays: p.graceDays, financialTermsLockedAt: p.financialTermsLockedAt, closedAt: p.closedAt, createdAt: p.createdAt,
    stats: projectStats(p), version: p.version,
  }
}

export function project(p: ProjectRow): In<typeof Project> {
  return { ...projectSummary(p), description: p.description, paymentMethods: p.paymentMethods.map(m => ({ ...m })) }
}

// ---------------------------------------------------------------- Échéances, inscriptions

export function installment(i: InstallmentView): In<typeof Installment> {
  return {
    id: i.id, enrollmentId: i.enrollmentId, projectId: i.projectId, kind: i.kind, sequence: i.sequence, dueDate: i.dueDate,
    amountDue: money(i.amountDue), amountPaid: money(i.amountPaid), amountPending: money(i.amountPending),
    remaining: money(Math.max(0, i.remaining)), status: i.status, lateSince: i.lateSince, paidAt: i.paidAt,
  }
}

export function enrollment(e: EnrollmentRow): In<typeof Enrollment> {
  const f = enrollmentFigures(e)
  return {
    id: e.id, projectId: e.projectId, member: personContact(userRow(e.userId)), status: e.status, standing: f.standing,
    startsFrom: e.startsFrom, joinedAt: e.joinedAt, contractSignedAt: e.contractSignedAt, paid: money(f.paid),
    remaining: money(f.remaining), lateAmount: money(f.lateAmount), commitment: moneyOrNull(f.commitment), withdrawnAt: e.withdrawnAt,
  }
}

// ---------------------------------------------------------------- Paiements

/**
 * Échéances couvertes par un paiement, selon son état : propositions (en attente), allocations confirmées (validé),
 * répartition déclarée annulée (rejeté). Les lignes annulées des cycles précédents ne sont pas montrées.
 */
export function covered(p: PaymentRow) {
  const rows = p.status === 'pending'
    ? db.allocations.filter(a => a.paymentId === p.id && a.state === 'proposed')
    : p.status === 'validated'
      ? db.allocations.filter(a => a.paymentId === p.id && a.state === 'confirmed')
      : p.declaredAllocations.map(a => ({ ...a, paymentId: p.id, state: 'voided' as const }))
  return rows
    .map((a) => {
      const i = db.installments.find(x => x.id === a.installmentId)!
      return { installmentId: i.id, kind: i.kind, sequence: i.sequence, dueDate: i.dueDate, amount: money(a.amount), state: a.state }
    })
    .sort((a, b) => a.sequence - b.sequence)
}

const proof = (p: PaymentRow) => ({ ...p.proof })

export function paymentSummary(p: PaymentRow): In<typeof PaymentSummary> {
  return {
    id: p.id, status: p.status, amountDeclared: money(p.amountDeclared), amountReceived: moneyOrNull(p.amountReceived),
    paidOn: p.paidOn, declaredAt: p.declaredAt, paymentMethodKind: p.paymentMethodKind, member: personRef(userRow(p.userId)),
    project: projectRef(projectRow(p.projectId)), covered: covered(p), proof: proof(p), reviewedBy: personRefById(p.reviewedBy),
    reviewedAt: p.reviewedAt,
  }
}

/** Fenêtre d'annulation d'une validation (10 min, heure réelle du serveur de dev). */
export const revertibleUntil = new Map<string, number>()

export function paymentDetail(p: PaymentRow): In<typeof PaymentDetail> {
  const method = p.paymentMethodId ? paymentMethodsOf(p.associationId).find(m => m.id === p.paymentMethodId) ?? null : null
  const recent = db.payments
    .filter(x => x.id !== p.id && x.enrollmentId === p.enrollmentId && x.status === 'validated')
    .sort((a, b) => b.declaredAt.localeCompare(a.declaredAt))
    .slice(0, 3)
  const until = revertibleUntil.get(p.id)
  return {
    ...paymentSummary(p), paymentMethod: method, comment: p.comment, allocationAdjusted: p.allocationAdjusted,
    rejection: p.rejection ? { ...p.rejection } : null,
    schedule: db.installments.filter(i => i.enrollmentId === p.enrollmentId).sort((a, b) => a.sequence - b.sequence).map(i => installment(installmentView(i))),
    recentPayments: recent.map(paymentSummary),
    revertibleUntil: p.status === 'validated' && until && until > Date.now() ? new Date(until).toISOString() : null,
    version: p.version,
  }
}

export function subscriberPayment(p: PaymentRow): In<typeof SubscriberPayment> {
  return {
    id: p.id, status: p.status, amountDeclared: money(p.amountDeclared), amountReceived: moneyOrNull(p.amountReceived),
    paidOn: p.paidOn, declaredAt: p.declaredAt, paymentMethodKind: p.paymentMethodKind, project: projectRef(projectRow(p.projectId)),
    association: associationRef(associationRow(p.associationId)), covered: covered(p), proof: proof(p),
    rejection: p.rejection ? { ...p.rejection } : null, reviewedAt: p.reviewedAt,
  }
}

// ---------------------------------------------------------------- Souscripteur

export function subscriberProjectCard(e: EnrollmentRow): In<typeof SubscriberProjectCard> {
  const p = projectRow(e.projectId)
  const f = enrollmentFigures(e)
  return {
    enrollmentId: e.id, project: { ...projectRef(p), status: p.status }, association: associationRef(associationRow(p.associationId)),
    standing: f.standing, paid: money(f.paid), remaining: money(f.remaining), commitment: moneyOrNull(f.commitment),
    progress: f.progress === null ? null : Math.min(1, f.progress),
    late: f.lateCount > 0 ? { count: f.lateCount, amount: money(f.lateAmount), since: f.lateFrom! } : null,
    nextDue: f.nextDue ? { dueDate: f.nextDue.dueDate, amount: money(f.nextDue.amount) } : null,
  }
}

/** Inscriptions de la personne connectée, triées : retard, signature, prochaine échéance (tableau de bord). */
export function enrollmentsOfUser(userId: string): EnrollmentRow[] {
  const rank = (e: EnrollmentRow) => {
    const f = enrollmentFigures(e)
    return f.standing === 'late' ? 0 : f.standing === 'signature_required' ? 1 : 2
  }
  const next = (e: EnrollmentRow) => enrollmentFigures(e).nextDue?.dueDate ?? '9999'
  return db.enrollments
    .filter(e => e.userId === userId && e.status !== 'withdrawn')
    .sort((a, b) => rank(a) - rank(b) || next(a).localeCompare(next(b)) || projectRow(a.projectId).createdAt.localeCompare(projectRow(b.projectId).createdAt))
}

// ---------------------------------------------------------------- Notifications

export function notification(n: NotificationRow): In<typeof Notification> {
  return {
    id: n.id, type: n.type, title: n.title, body: n.body, actionUrl: n.actionUrl,
    data: n.actionLabel ? { actionLabel: n.actionLabel } : {}, associationId: n.associationId, readAt: n.readAt, createdAt: n.createdAt,
  }
}

export { today }
