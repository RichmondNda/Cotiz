import type { AssociationRequestDetail, AssociationRequestSummary, PersonRef, PlanRef } from '@cotiz/contracts';
import type { associationRequests } from '@cotiz/db';
import { platformPersonRefsOf } from '../../identity/identity.public.js';
import { planRefsOf } from '../../billing/billing.public.js';

export type RequestRow = typeof associationRequests.$inferSelect;

/** Plans souhaités et personnes citées (consultation, décision) des demandes données, en deux lectures. */
export async function referencesOf(rows: readonly RequestRow[]) {
  // L'une après l'autre : une transaction n'exécute qu'une requête à la fois.
  const plans = await planRefsOf(rows.flatMap((r) => (r.desiredPlanId ? [r.desiredPlanId] : [])));
  const people = await platformPersonRefsOf(
    rows.flatMap((r) => [r.viewedBy, r.decidedBy].filter((id): id is string => id !== null)),
  );
  return { plans, people };
}

type References = Awaited<ReturnType<typeof referencesOf>>;

function person(people: Map<string, PersonRef>, id: string | null): PersonRef | null {
  if (!id) return null;
  const ref = people.get(id);
  if (!ref) throw new Error(`demande : personne ${id} introuvable`);
  return ref;
}

export function toSummary(row: RequestRow, plans: Map<string, PlanRef>): AssociationRequestSummary {
  return {
    id: row.id,
    reference: row.reference,
    status: row.status,
    associationName: row.associationName,
    associationType: row.associationType,
    city: row.city,
    country: row.country,
    contact: { firstName: row.contactFirstName, lastName: row.contactLastName, email: row.contactEmail },
    estimatedSubscribers: row.estimatedSubscribers,
    desiredPlan: row.desiredPlanId ? (plans.get(row.desiredPlanId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Fiche d'une demande (sa-demande-detail) : la note interne n'est servie qu'à la plateforme. */
export function toDetail(row: RequestRow, { plans, people }: References): AssociationRequestDetail {
  const decidedBy = person(people, row.decidedBy);
  const decided =
    row.status !== 'pending' && row.decidedAt && decidedBy
      ? { type: row.status, at: row.decidedAt.toISOString(), by: decidedBy }
      : null;
  return {
    ...toSummary(row, plans),
    association: {
      name: row.associationName,
      type: row.associationType,
      city: row.city,
      country: row.country,
      registrationNumber: row.registrationNumber,
      activityDescription: row.activityDescription,
    },
    contact: {
      firstName: row.contactFirstName,
      lastName: row.contactLastName,
      title: row.contactTitle,
      email: row.contactEmail,
      phone: row.contactPhone,
    },
    needs: {
      estimatedSubscribers: row.estimatedSubscribers,
      plannedProjects: row.plannedProjects,
      desiredPlanId: row.desiredPlanId,
      acquisitionSource: row.acquisitionSource,
    },
    termsAcceptedAt: row.termsAcceptedAt.toISOString(),
    decision: decided
      ? {
          decidedAt: decided.at,
          decidedBy: decided.by,
          rejectionReasonCode: row.rejectionReasonCode,
          rejectionMessage: row.rejectionMessage,
          associationId: row.associationId,
        }
      : null,
    internalNote: row.internalNote,
    viewedAt: row.viewedAt?.toISOString() ?? null,
    viewedBy: person(people, row.viewedBy),
    history: [{ type: 'received', at: row.createdAt.toISOString(), by: null }, ...(decided ? [decided] : [])],
  };
}
