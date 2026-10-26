import type { Enrollment, Installment } from '@cotiz/contracts';
import { installments } from '@cotiz/db';
import {
  type Currency,
  enrollmentTotals,
  installmentStatus,
  type IsoDate,
  lateSince,
  memberStanding,
  Money,
  remainingOf,
} from '@cotiz/domain';
import { asc, inArray } from 'drizzle-orm';
import type { SubscriberContact } from '../../identity/identity.public.js';
import type { ProjectRecord } from '../../projects/projects.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { EnrollmentRecord } from './enrollment-records.js';

export type InstallmentRecord = typeof installments.$inferSelect;

/** Échéances de ces inscriptions (RLS du contexte), par inscription, dans l'ordre de la grille. */
export async function installmentsByEnrollment(
  enrollmentIds: readonly string[],
): Promise<Map<string, InstallmentRecord[]>> {
  const byEnrollment = new Map<string, InstallmentRecord[]>(enrollmentIds.map((id) => [id, []]));
  if (enrollmentIds.length === 0) return byEnrollment;
  const rows = await currentTx()
    .select()
    .from(installments)
    .where(inArray(installments.enrollmentId, [...enrollmentIds]))
    .orderBy(asc(installments.enrollmentId), asc(installments.kind), asc(installments.sequence));
  for (const row of rows) byEnrollment.get(row.enrollmentId)?.push(row);
  return byEnrollment;
}

/** Montants (entiers de la devise du projet) et statut calculé au jour de l'association (domain-rules § 6). */
function computed(i: InstallmentRecord, project: ProjectRecord, today: IsoDate) {
  const currency = project.currency as Currency;
  const amountDue = Money.fromDb(i.amountDue, currency).amount;
  const amountPaid = Money.fromDb(i.amountPaid, currency).amount;
  const amountPending = Money.fromDb(i.amountPending, currency).amount;
  const status = installmentStatus(
    { dueDate: i.dueDate, amountDue, amountPaid, amountPending, status: i.status },
    today,
    project.graceDays,
  );
  return { amountDue, amountPaid, amountPending, status };
}

/**
 * Inscription du contrat (onglet Souscripteurs, annuaire, fiche, réponse de en.create) à partir de ses échéances déjà
 * chargées : statuts par installmentStatus() au jour de l'association, totaux par enrollmentTotals(), situation par
 * memberStanding() ; un compte non activé et à jour est « activation en attente » (domain-rules § 7).
 */
export function enrollmentView(
  row: EnrollmentRecord,
  project: ProjectRecord,
  member: SubscriberContact,
  today: IsoDate,
  lines: readonly InstallmentRecord[],
): Enrollment {
  const currency = project.currency as Currency;
  const states = lines.map((i) => computed(i, project, today));
  const totals = enrollmentTotals(states, project.scheduleType);
  const standing = memberStanding(
    row.status,
    states.map((l) => l.status),
  );
  const { status: accountStatus, ...contact } = member;
  return {
    id: row.id,
    projectId: row.projectId,
    member: contact,
    status: row.status,
    standing: standing === 'up_to_date' && accountStatus === 'pending_activation' ? 'activation_pending' : standing,
    startsFrom: row.startsFrom,
    joinedAt: row.joinedAt.toISOString(),
    // Signature des contrats : lot 4.1.
    contractSignedAt: null,
    paid: Money.of(totals.paid, currency),
    remaining: Money.of(totals.remaining, currency),
    lateAmount: Money.of(totals.lateAmount, currency),
    commitment: totals.commitment === null ? null : Money.of(totals.commitment, currency),
    withdrawnAt: row.withdrawnAt?.toISOString() ?? null,
  };
}

/** Inscription seule (en.create, en.withdraw) : ses échéances lues, puis enrollmentView(). */
export async function toEnrollment(
  row: EnrollmentRecord,
  project: ProjectRecord,
  member: SubscriberContact,
  today: IsoDate,
): Promise<Enrollment> {
  const lines = (await installmentsByEnrollment([row.id])).get(row.id) ?? [];
  return enrollmentView(row, project, member, today, lines);
}

/** Case de la grille (fiche) : montants, reste dû (domain-rules § 3), statut et retard calculés au jour donné. */
export function installmentView(i: InstallmentRecord, project: ProjectRecord, today: IsoDate): Installment {
  const currency = project.currency as Currency;
  const state = computed(i, project, today);
  return {
    id: i.id,
    enrollmentId: i.enrollmentId,
    projectId: i.projectId,
    kind: i.kind,
    sequence: i.sequence,
    dueDate: i.dueDate,
    amountDue: Money.of(state.amountDue, currency),
    amountPaid: Money.of(state.amountPaid, currency),
    amountPending: Money.of(state.amountPending, currency),
    remaining: Money.of(
      remainingOf({
        id: i.id,
        enrollmentId: i.enrollmentId,
        kind: i.kind,
        sequence: i.sequence,
        dueDate: i.dueDate,
        ...state,
      }),
      currency,
    ),
    status: state.status,
    lateSince: state.status === 'late' ? (i.lateSince ?? lateSince(i, project.graceDays)) : null,
    paidAt: i.paidAt?.toISOString() ?? null,
  };
}
