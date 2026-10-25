// Projets d'une association : rapport (rp.report, lot 5.3). Liste, création, aperçu, paramètres, cycle de vie et vue
// d'ensemble (pr.*) sont servis par NestJS depuis le lot 2.2.
import { db } from '../db'
import type { ProjectRow } from '../db'
import type { MockContext } from '../http'
import { enrollmentFigures, enrollmentsOfProject, projectFigures, scheduleFrom, today } from '../ledger'
import { money, personRef, projectRow, userRow } from '../views'

/** Collecte reçue des 7 premières échéances de Centre communautaire : barres de la maquette MgProjet. */
const RECEIVED_RATIOS = [0.99, 0.97, 0.9, 0.86, 0.83, 0.8, 0.95]
/** Taux de recouvrement cumulé après chaque échéance : courbe de la maquette MgProjetRapports (100 % → 82 %). */
const RATE_CURVE = [1, 0.98, 0.95, 0.92, 0.89, 0.86, 0.82]

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
