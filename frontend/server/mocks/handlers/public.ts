// Formulaire public de demande de création d'association (pub.request).
import { db } from '../db'
import type { MockContext } from '../http'
import { nowInstant, problem } from '../http'
import { uid } from '../ids'

export function requestCreate(ctx: MockContext<'pub.request', 'create'>) {
  const b = ctx.body
  if (b.website) problem('challenge_failed')
  if (b.needs.desiredPlanId && !db.plans.some(p => p.id === b.needs.desiredPlanId)) problem('validation_failed', { fields: { 'needs.desiredPlanId': 'unknown' } })
  const key = `${b.association.name}-${Date.now()}`
  const now = nowInstant()
  const row = {
    id: uid('request', key), key, reference: '[RÉF. DE LA DEMANDE]', status: 'pending' as const,
    association: { name: b.association.name, type: b.association.type, city: b.association.city, country: b.association.country, registrationNumber: b.association.registrationNumber ?? null, activityDescription: b.association.activityDescription },
    contact: { firstName: b.contact.firstName, lastName: b.contact.lastName, title: b.contact.title, email: b.contact.email, phone: b.contact.phone },
    needs: { estimatedSubscribers: b.needs.estimatedSubscribers, plannedProjects: b.needs.plannedProjects ?? null, desiredPlanId: b.needs.desiredPlanId ?? null, acquisitionSource: b.needs.acquisitionSource ?? null },
    termsAcceptedAt: now, createdAt: now, viewedAt: null, viewedBy: null, decidedAt: null, decidedBy: null, rejectionReasonCode: null,
    rejectionMessage: null, internalNote: null, associationId: null, approvedPlanId: null,
  }
  db.requests.push(row)
  return { id: row.id, reference: row.reference, contactEmail: row.contact.email }
}
