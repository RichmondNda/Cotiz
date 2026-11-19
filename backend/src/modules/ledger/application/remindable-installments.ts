import { enrollments, installments } from '@cotiz/db';
import { type Currency, type IsoDate, Money, remainingOf } from '@cotiz/domain';
import { and, asc, eq, inArray, notInArray, type SQL } from 'drizzle-orm';
import { projectsOf } from '../../projects/projects.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { FINAL_INSTALLMENT_STATUSES, toLedger } from './payment-review.js';

/** Échéance qu'une relance peut viser (lot 4.3) : reste dû relu, retard selon le statut tenu à jour chaque nuit. */
export interface RemindableInstallment {
  id: string;
  userId: string;
  projectId: string;
  enrollmentId: string;
  dueDate: IsoDate;
  remaining: Money;
  /** Statut `late` (installments.refresh-statuses, 01:00 locale) ; `lateSince` : premier jour de retard. */
  late: boolean;
  lateSince: IsoDate | null;
}

/** Projets dont les échéances se relancent : ni brouillon, ni clos, ni annulé (project.closed → plus de relance). */
const REMINDED_PROJECTS = new Set(['enrolling', 'active']);

/**
 * Échéances d'une association à relancer, lues dans son contexte (RLS) : inscription active, projet en cours, ni
 * soldée, ni dispensée (décision 7), ni annulée, avec un reste dû. Filtres : jour d'échéance, projet, personnes,
 * échéances, en retard seulement. Ordre : échéance, puis id.
 */
export async function remindableInstallmentsOf(
  associationId: string,
  filter: {
    dueDate?: IsoDate;
    projectId?: string | null;
    userIds?: readonly string[];
    installmentIds?: readonly string[];
    lateOnly?: boolean;
  },
): Promise<RemindableInstallment[]> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('remindableInstallmentsOf : contexte de cette association seulement');
  }
  const conditions: SQL[] = [
    eq(installments.associationId, associationId),
    eq(enrollments.associationId, associationId),
    eq(enrollments.status, 'active'),
    notInArray(installments.status, [...FINAL_INSTALLMENT_STATUSES]),
  ];
  if (filter.dueDate) conditions.push(eq(installments.dueDate, filter.dueDate));
  if (filter.projectId) conditions.push(eq(installments.projectId, filter.projectId));
  if (filter.userIds) {
    if (filter.userIds.length === 0) return [];
    conditions.push(inArray(installments.userId, [...new Set(filter.userIds)]));
  }
  if (filter.installmentIds) {
    if (filter.installmentIds.length === 0) return [];
    conditions.push(inArray(installments.id, [...new Set(filter.installmentIds)]));
  }
  if (filter.lateOnly) conditions.push(eq(installments.status, 'late'));
  const rows = (
    await currentTx()
      .select({ installment: installments })
      .from(installments)
      .innerJoin(enrollments, eq(enrollments.id, installments.enrollmentId))
      .where(and(...conditions))
      .orderBy(asc(installments.dueDate), asc(installments.id))
  ).map((r) => r.installment);
  if (rows.length === 0) return [];
  const projects = await projectsOf(associationId, [...new Set(rows.map((r) => r.projectId))]);
  const result: RemindableInstallment[] = [];
  for (const i of rows) {
    const project = projects.get(i.projectId);
    if (!project || !REMINDED_PROJECTS.has(project.status)) continue;
    const currency = project.currency as Currency;
    const left = remainingOf(toLedger(i, currency));
    if (left <= 0) continue;
    result.push({
      id: i.id,
      userId: i.userId,
      projectId: i.projectId,
      enrollmentId: i.enrollmentId,
      dueDate: i.dueDate,
      remaining: Money.of(left, currency),
      late: i.status === 'late',
      lateSince: i.lateSince,
    });
  }
  return result;
}
