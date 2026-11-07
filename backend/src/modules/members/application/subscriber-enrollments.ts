import { enrollments } from '@cotiz/db';
import { type IsoDate, todayIn } from '@cotiz/domain';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import { activeMembershipsOf } from '../../access/access.public.js';
import { type ProjectRecord, projectsOf } from '../../projects/projects.public.js';
import { type SubscriberAssociation, subscriberAssociationsOf } from '../../tenancy/tenancy.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import type { EnrollmentRecord } from './enrollment-records.js';
import {
  computedStates,
  type InstallmentComputed,
  type InstallmentRecord,
  installmentsByEnrollment,
  pendingSignatureStates,
} from './enrollment-views.js';

/** Une inscription de la personne connectée, avec ce qu'il faut pour la présenter (espace souscripteur, lot 3.2). */
export interface SubscriberEnrollment {
  row: EnrollmentRecord;
  project: ProjectRecord;
  association: SubscriberAssociation;
  /** Aujourd'hui dans le fuseau de l'association (domain-rules § 6). */
  today: IsoDate;
  /** Échéances générées, dans l'ordre de la grille. */
  lines: InstallmentRecord[];
  /** Montants et statut calculés de chaque échéance de `lines` (même ordre). */
  states: InstallmentComputed[];
  /** Pour l'engagement et le reste : l'échéancier à venir d'une inscription en attente de signature, sinon `states`. */
  totalsStates: InstallmentComputed[];
}

/**
 * Inscriptions de la personne connectée (espace subscriber, RLS `subscriber_self_read`), non retirées, dans les
 * associations où elle est souscriptrice active (comme la cloche) ; `projectId` : celle de ce projet seulement.
 * Mêmes calculs que la vue gestionnaire (`enrollmentView`) : statuts au jour de l'association, engagement d'une
 * inscription en attente de signature par `pendingSignatureStates`.
 */
export async function subscriberEnrollmentsOf(filter: { projectId?: string } = {}): Promise<SubscriberEnrollment[]> {
  const context = currentContext();
  const userId = context?.userId;
  if (context?.space !== 'subscriber' || !userId) {
    throw new Error('subscriberEnrollmentsOf : espace souscripteur seulement');
  }
  const memberOf = (await activeMembershipsOf(userId))
    .filter((m) => m.role === 'subscriber')
    .map((m) => m.association.id);
  if (memberOf.length === 0) return [];
  // Une transaction = une connexion : lectures l'une après l'autre.
  const rows = await currentTx()
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, userId),
        ne(enrollments.status, 'withdrawn'),
        inArray(enrollments.associationId, memberOf),
        filter.projectId ? eq(enrollments.projectId, filter.projectId) : undefined,
      ),
    )
    .orderBy(asc(enrollments.joinedAt), asc(enrollments.id));
  if (rows.length === 0) return [];
  const associations = await subscriberAssociationsOf(rows.map((r) => r.associationId));
  const projects = new Map<string, ProjectRecord>();
  for (const associationId of new Set(rows.map((r) => r.associationId))) {
    const own = await projectsOf(
      associationId,
      rows.filter((r) => r.associationId === associationId).map((r) => r.projectId),
    );
    for (const [id, project] of own) projects.set(id, project);
  }
  const lines = await installmentsByEnrollment(rows.map((r) => r.id));
  return rows.flatMap((row) => {
    const project = projects.get(row.projectId);
    const association = associations.get(row.associationId);
    // Association devenue illisible entre deux lectures (appartenance retirée) : inscription non présentée.
    if (!project || !association) return [];
    const today = todayIn(association.timezone);
    const installments = lines.get(row.id) ?? [];
    const states = computedStates(installments, project, today);
    return [
      {
        row,
        project,
        association,
        today,
        lines: installments,
        states,
        totalsStates: pendingSignatureStates(row, project, installments) ?? states,
      },
    ];
  });
}
