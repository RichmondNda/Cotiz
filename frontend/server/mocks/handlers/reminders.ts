// Relances (rm.*, lot 4.3) : règles automatiques, file « À relancer » (une entrée par échéance en retard, avec message
// prêt), envoi ponctuel, historique des envois. Aucun SMS ni email : le message est transmis par une personne.
import { formatMoney } from '@cotiz/domain'
import { formatDate } from '../../../app/utils/format'
import { db } from '../db'
import type { ReminderRunRow } from '../db'
import type { MockContext } from '../http'
import { nowInstant, problem, requireSession } from '../http'
import { uid } from '../ids'
import { enrollmentFigures, enrollmentsOfProject } from '../ledger'
import { personContact, personRef, projectRef, projectRow, userRow } from '../views'
import { page } from './list'

const F = (amount: number) => formatMoney({ amount, currency: 'XOF' })

function rule(r: (typeof db.reminderRules)[number]) {
  return { id: r.id, projectId: r.projectId, trigger: r.trigger, offsetDays: r.offsetDays, channels: [...r.channels], message: r.message, isActive: r.isActive, createdAt: r.createdAt }
}

export function rulesList(ctx: MockContext<'rm.rules', 'list'>) {
  return { items: db.reminderRules.filter(r => r.associationId === ctx.params.aid).map(rule) }
}

export function ruleCreate(ctx: MockContext<'rm.rules', 'create'>) {
  const row = { id: uid('reminder-rule', `${Date.now()}`), associationId: ctx.params.aid, createdAt: nowInstant(), ...ctx.body, channels: [...ctx.body.channels] }
  db.reminderRules.push(row)
  return rule(row)
}

export function rulePatch(ctx: MockContext<'rm.rules', 'patch'>) {
  const r = db.reminderRules.find(x => x.id === ctx.params.id && x.associationId === ctx.params.aid) ?? problem('not_found')
  Object.assign(r, Object.fromEntries(Object.entries(ctx.body).filter(([, v]) => v !== undefined)))
  return rule(r)
}

/** File « À relancer » : chaque échéance en retard des projets de l'association, avec le message prêt. */
function queueEntries(aid: string) {
  const handled = new Map(db.reminderRuns.filter(r => r.installmentId && (r.status === 'handled' || r.status === 'dismissed')).map(r => [r.installmentId!, r]))
  return db.projects
    .filter(p => p.associationId === aid)
    .flatMap(p => enrollmentsOfProject(p.id).flatMap((e) => {
      const u = userRow(e.userId)
      return enrollmentFigures(e).installments.filter(i => i.status === 'late').map((i) => {
        const done = handled.get(i.id)
        const message = `Bonjour ${u.firstName}, votre échéance du ${formatDate(i.dueDate, 'long')} pour ${p.name} (${F(i.amountDue - i.amountPaid)}) n’est pas encore réglée. Merci de la régulariser et de déclarer votre paiement sur Cotiz.`
        const phone = u.phone?.replace('+', '')
        return {
          id: uid('reminder-run', `queue-${i.id}`), member: personContact(u), project: projectRef(p), installmentId: i.id,
          dueDate: i.dueDate, amountDue: { amount: i.amountDue - i.amountPaid, currency: 'XOF' as const }, lateSince: i.lateSince,
          kind: 'automatic' as const, status: done?.status ?? 'to_handle' as const, message,
          whatsappUrl: phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : null,
          smsUrl: u.phone ? `sms:${u.phone}?body=${encodeURIComponent(message)}` : null,
          createdAt: i.lateSince ? `${i.lateSince}T07:30:00Z` : nowInstant(),
        }
      })
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amountDue.amount - a.amountDue.amount)
}

export function queueList(ctx: MockContext<'rm.queue', 'list'>) {
  let rows = queueEntries(ctx.params.aid)
  if (ctx.query.status) rows = rows.filter(r => r.status === ctx.query.status)
  if (ctx.query.projectId) rows = rows.filter(r => r.project.id === ctx.query.projectId)
  return page(rows, ctx.query)
}

export function queueHandled(ctx: MockContext<'rm.queue', 'handled'>) {
  const entry = queueEntries(ctx.params.aid).find(e => e.id === ctx.params.id) ?? problem('not_found')
  const enrollment = db.enrollments.find(e => e.projectId === entry.project.id && e.userId === entry.member.id)!
  db.reminderRuns.push({
    id: uid('reminder-run', `${entry.id}-${Date.now()}`), associationId: ctx.params.aid, at: nowInstant(), kind: 'manual', status: ctx.body.outcome,
    userId: enrollment.userId, projectId: entry.project.id, installmentId: entry.installmentId, channels: ['manual'], message: entry.message,
    triggeredBy: requireSession(ctx).userId, ruleId: null,
  })
  return { ...entry, status: ctx.body.outcome }
}

export function send(ctx: MockContext<'rm.send', 'send'>) {
  const aid = ctx.params.aid
  const b = ctx.body
  const entries = queueEntries(aid)
  const targets = 'allLate' in b
    ? entries.filter(e => e.project.id === b.projectId)
    : entries.filter(e => b.userIds.includes(e.member.id) && (!b.projectId || e.project.id === b.projectId))
  if (!targets.length) problem('validation_failed', { fields: { userIds: 'no_late_installment' } })
  const now = nowInstant()
  const by = requireSession(ctx).userId
  const runs: ReminderRunRow[] = targets.map(e => ({
    id: uid('reminder-run', `${e.id}-${now}`), associationId: aid, at: now, kind: 'manual', status: 'to_handle', userId: e.member.id,
    projectId: e.project.id, installmentId: e.installmentId, channels: ['in_app'], message: b.message ?? e.message, triggeredBy: by, ruleId: null,
  }))
  db.reminderRuns.push(...runs)
  return { queued: targets.map(e => ({ ...e, kind: 'manual' as const, message: b.message ?? e.message })) }
}

export function historyList(ctx: MockContext<'rm.hist', 'list'>) {
  const rows = db.reminderRuns
    .filter(r => r.associationId === ctx.params.aid && (!ctx.query.projectId || r.projectId === ctx.query.projectId))
    .filter(r => r.status === 'auto_sent' || r.kind === 'manual')
    .sort((a, b) => b.at.localeCompare(a.at))
    .map(r => ({
      id: r.id, at: r.at, kind: r.kind, status: r.status, member: personRef(userRow(r.userId)), project: projectRef(projectRow(r.projectId)),
      channels: [...r.channels], message: r.message, triggeredBy: r.triggeredBy ? personRef(userRow(r.triggeredBy)) : null, ruleId: r.ruleId,
    }))
  return page(rows, ctx.query)
}
