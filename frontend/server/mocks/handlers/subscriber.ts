// Espace souscripteur (tableau de bord et projets : NestJS depuis le lot 3.2 ; déclaration et suivi d'un paiement : lot 3.3 ; historique : lot 3.4 ; contrats : lot 4.1) : associations.
import { db } from '../db'
import type { MockContext } from '../http'
import { problem, requireSession } from '../http'
import { enrollmentFigures, sum } from '../ledger'
import {
  associationRef, associationRow, enrollmentsOfUser, money, paymentMethodsOf, projectRow, subscriberProjectCard,
} from '../views'

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
