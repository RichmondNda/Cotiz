// Calculs du registre simulé : uniquement des appels à @cotiz/domain (statuts, situation, répartition) et des sommes.
// Mêmes définitions que le back : reste = dû − payé ; retard = échéances `late` ; attendu à date = échéances échues.
import { generateSchedule, installmentStatus, lateSince as domainLateSince, memberStanding } from '@cotiz/domain'
import type { InstallmentStatus, LedgerInstallment, MemberStanding } from '@cotiz/domain'
import { db } from './db'
import type { EnrollmentRow, InstallmentRow, ProjectRow } from './db'

export const today = () => db.today
export const monthOf = (iso: string) => iso.slice(0, 7)

export function projectById(id: string): ProjectRow | undefined {
  return db.projects.find(p => p.id === id)
}

export function enrollmentById(id: string): EnrollmentRow | undefined {
  return db.enrollments.find(e => e.id === id)
}

/** Allocations proposées des paiements en attente (amountPending). */
export function amountPending(installmentId: string): number {
  return db.allocations
    .filter(a => a.installmentId === installmentId && a.state === 'proposed')
    .reduce((t, a) => t + a.amount, 0)
}

export interface InstallmentView extends InstallmentRow {
  amountPending: number
  remaining: number
  status: InstallmentStatus
  lateSince: string | null
}

export function installmentView(row: InstallmentRow): InstallmentView {
  const project = projectById(row.projectId)!
  const pending = amountPending(row.id)
  const status = installmentStatus(
    { dueDate: row.dueDate, amountDue: row.amountDue, amountPaid: row.amountPaid, amountPending: pending, status: row.persistedStatus === 'open' ? 'upcoming' : row.persistedStatus },
    today(),
    project.graceDays,
  )
  return {
    ...row,
    amountPending: pending,
    remaining: row.amountDue - row.amountPaid - pending,
    status,
    lateSince: status === 'late' ? domainLateSince(row, project.graceDays) : null,
  }
}

/** Échéances d'une inscription, dans l'ordre (fonds d'entrée puis séquence). */
export function installmentsOf(enrollmentId: string): InstallmentView[] {
  return db.installments
    .filter(i => i.enrollmentId === enrollmentId)
    .sort((a, b) => a.sequence - b.sequence)
    .map(installmentView)
}

/** Forme attendue par proposeAllocation / validateAllocation. */
export function ledgerInstallments(enrollmentId: string): LedgerInstallment[] {
  return installmentsOf(enrollmentId).map(i => ({
    id: i.id, enrollmentId: i.enrollmentId, kind: i.kind, sequence: i.sequence, dueDate: i.dueDate,
    amountDue: i.amountDue, amountPaid: i.amountPaid, amountPending: i.amountPending,
    status: i.persistedStatus === 'open' ? i.status : i.persistedStatus,
  }))
}

const live = (i: InstallmentView) => i.persistedStatus !== 'canceled' && i.persistedStatus !== 'waived'

export interface EnrollmentFigures {
  installments: InstallmentView[]
  paid: number
  remaining: number
  commitment: number | null
  lateAmount: number
  lateCount: number
  /** Date d'échéance de la plus ancienne échéance en retard (« depuis le 5 août »). */
  lateFrom: string | null
  lateDueDates: string[]
  expectedToDate: number
  nextDue: { dueDate: string, amount: number } | null
  standing: MemberStanding
  progress: number | null
}

export function enrollmentFigures(enrollment: EnrollmentRow): EnrollmentFigures {
  const project = projectById(enrollment.projectId)!
  const installments = installmentsOf(enrollment.id)
  const lives = installments.filter(live)
  const paid = sum(lives.map(i => i.amountPaid))
  const due = sum(lives.map(i => i.amountDue))
  const late = lives.filter(i => i.status === 'late')
  const next = lives.find(i => i.dueDate > today() && i.amountPaid < i.amountDue)
  // Signature attendue : aucun échéancier encore (généré à la signature) ; l'engagement est celui qui sera généré
  // à partir de la date d'entrée (aucune échéance rétroactive, domain-rules § 2).
  const commitment = project.scheduleType !== 'fixed'
    ? null
    : enrollment.status === 'pending_signature' ? sum(scheduleFrom(project, enrollment.startsFrom).map(l => l.amountDue)) : due
  const user = db.users.find(u => u.id === enrollment.userId)
  let standing: MemberStanding = memberStanding(enrollment.status, lives.map(i => i.status))
  if (standing === 'up_to_date' && user?.status === 'pending_activation') standing = 'activation_pending'
  return {
    installments,
    paid,
    remaining: (commitment ?? due) - paid,
    commitment,
    lateAmount: sum(late.map(i => i.amountDue - i.amountPaid)),
    lateCount: late.length,
    lateFrom: late[0]?.dueDate ?? null,
    lateDueDates: late.map(i => i.dueDate),
    expectedToDate: sum(lives.filter(i => i.dueDate <= today()).map(i => i.amountDue)),
    nextDue: next ? { dueDate: next.dueDate, amount: next.amountDue - next.amountPaid } : null,
    standing,
    progress: commitment ? paid / commitment : null,
  }
}

export function enrollmentsOfProject(projectId: string, withWithdrawn = false): EnrollmentRow[] {
  return db.enrollments.filter(e => e.projectId === projectId && (withWithdrawn || e.status !== 'withdrawn'))
}

export function unlistedOf(scope: 'project' | 'association', id: string) {
  return db.unlisted.find(u => u.scope === scope && u.scopeId === id)
}

/** Échéancier d'un projet pour une date d'entrée (generateSchedule de @cotiz/domain). */
export function scheduleFrom(project: ProjectRow, enrolledFrom?: string) {
  return generateSchedule({
    installmentAmount: project.installmentAmount, entryFeeAmount: project.entryFee, frequency: project.frequency,
    dueDay: project.dueDay, scheduleType: project.scheduleType, startDate: project.startDate, endDate: project.endDate,
    enrolledFrom: enrolledFrom ?? null,
  })
}

/** Nombre d'échéances périodiques et engagement par souscripteur d'un projet à dates fixes. */
export function projectTerms(project: ProjectRow): { installmentsCount: number | null, totalPerSubscriber: number | null } {
  if (project.scheduleType !== 'fixed') return { installmentsCount: null, totalPerSubscriber: null }
  const lines = scheduleFrom(project)
  return { installmentsCount: lines.filter(l => l.kind === 'periodic').length, totalPerSubscriber: sum(lines.map(l => l.amountDue)) }
}

export interface ProjectFigures {
  subscribersCount: number
  collected: number
  expectedToDate: number
  recoveryRate: number | null
  progress: number | null
  lateSubscribersCount: number
  lateAmount: number
  pendingPaymentsCount: number
  oldestPendingAt: string | null
  pendingSignaturesCount: number
  nextDueDate: string | null
  nextDueTotal: number
  installmentsCount: number | null
  totalPerSubscriber: number | null
  collectedThisMonth: number
  expectedThisMonth: number
}

export function projectFigures(project: ProjectRow): ProjectFigures {
  const enrollments = enrollmentsOfProject(project.id)
  const figures = enrollments.map(enrollmentFigures)
  const extra = unlistedOf('project', project.id)
  const terms = projectTerms(project)
  const subscribersCount = enrollments.length + (extra?.members ?? 0)
  const collected = sum(figures.map(f => f.paid)) + (extra?.collected ?? 0)
  const expectedToDate = sum(figures.map(f => f.expectedToDate)) + (extra?.expectedToDate ?? 0)
  const month = monthOf(today())
  const thisMonth = figures.flatMap(f => f.installments).filter(i => live(i) && monthOf(i.dueDate) === month)
  const pending = db.payments
    .filter(p => p.projectId === project.id && p.status === 'pending')
    .sort((a, b) => a.declaredAt.localeCompare(b.declaredAt))
  const upcoming = figures.flatMap(f => f.installments).filter(i => i.dueDate > today()).map(i => i.dueDate).sort()
  const nextDueDate = upcoming[0] ?? null
  const progress = project.status === 'enrolling'
    ? (project.requiredSubscribers ? subscribersCount / project.requiredSubscribers : null)
    : (terms.totalPerSubscriber && subscribersCount ? collected / (subscribersCount * terms.totalPerSubscriber) : null)
  return {
    subscribersCount,
    collected,
    expectedToDate,
    recoveryRate: expectedToDate > 0 ? collected / expectedToDate : null,
    progress: progress === null ? null : Math.min(1, progress),
    lateSubscribersCount: figures.filter(f => f.standing === 'late').length + (extra?.late ?? 0),
    lateAmount: sum(figures.map(f => f.lateAmount)) + (extra?.lateAmount ?? 0),
    pendingPaymentsCount: pending.length,
    oldestPendingAt: pending[0]?.declaredAt ?? null,
    pendingSignaturesCount: enrollments.filter(e => e.status === 'pending_signature').length,
    nextDueDate,
    nextDueTotal: nextDueDate ? subscribersCount * project.installmentAmount : 0,
    ...terms,
    collectedThisMonth: sum(thisMonth.map(i => i.amountPaid)) + (extra?.collectedThisMonth ?? 0),
    expectedThisMonth: sum(thisMonth.map(i => i.amountDue)) + (extra?.expectedThisMonth ?? 0),
  }
}

export interface AssociationFigures {
  membersCount: number
  lateMembersCount: number
  collected: number
  expectedToDate: number
  recoveryRate: number | null
  collectedThisMonth: number
  expectedThisMonth: number
  pendingPaymentsCount: number
  oldestPendingAt: string | null
  projectsCount: number
}

/** Souscripteurs d'une association (memberships `subscriber` actives). */
export function subscribersOf(associationId: string) {
  return db.memberships.filter(m => m.associationId === associationId && m.role === 'subscriber' && m.status !== 'removed')
}

/** Pire situation d'un souscripteur sur les projets d'une association (annuaire). */
export function memberStandingIn(associationId: string, userId: string): MemberStanding {
  const projects = new Set(db.projects.filter(p => p.associationId === associationId).map(p => p.id))
  const standings = db.enrollments
    .filter(e => e.userId === userId && projects.has(e.projectId) && e.status !== 'withdrawn')
    .map(e => enrollmentFigures(e).standing)
  for (const s of ['late', 'signature_required', 'activation_pending', 'up_to_date'] as const) if (standings.includes(s)) return s
  return standings.length ? 'withdrawn' : 'up_to_date'
}

export function associationFigures(associationId: string): AssociationFigures {
  const projects = db.projects.filter(p => p.associationId === associationId)
  const figures = projects.map(projectFigures)
  const members = subscribersOf(associationId)
  const extra = unlistedOf('association', associationId)
  const lateNamed = members.filter(m => memberStandingIn(associationId, m.userId) === 'late').length
  const lateUnlisted = sum(projects.map(p => unlistedOf('project', p.id)?.late ?? 0))
  const collected = sum(figures.map(f => f.collected))
  const expectedToDate = sum(figures.map(f => f.expectedToDate))
  const pending = db.payments
    .filter(p => p.associationId === associationId && p.status === 'pending')
    .sort((a, b) => a.declaredAt.localeCompare(b.declaredAt))
  return {
    membersCount: members.length + (extra?.members ?? 0),
    lateMembersCount: lateNamed + lateUnlisted,
    collected,
    expectedToDate,
    recoveryRate: expectedToDate > 0 ? collected / expectedToDate : null,
    collectedThisMonth: sum(figures.map(f => f.collectedThisMonth)),
    expectedThisMonth: sum(figures.map(f => f.expectedThisMonth)),
    pendingPaymentsCount: pending.length,
    oldestPendingAt: pending[0]?.declaredAt ?? null,
    projectsCount: projects.length,
  }
}

export function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0)
}

/** Jours entiers écoulés entre une date ou un instant et « aujourd'hui » du jeu. */
export function daysSince(iso: string): number {
  return Math.round((Date.parse(`${today()}T00:00:00Z`) - Date.parse(`${iso.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
}
