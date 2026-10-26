import type { Enrollment } from '@cotiz/contracts';
import { installments } from '@cotiz/db';
import { type Currency, enrollmentTotals, installmentStatus, type IsoDate, memberStanding, Money } from '@cotiz/domain';
import { asc, eq } from 'drizzle-orm';
import type { SubscriberContact } from '../../identity/identity.public.js';
import type { ProjectRecord } from '../../projects/projects.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { EnrollmentRecord } from './enrollment-records.js';

/** Échéances d'une inscription (RLS du contexte), dans l'ordre de la grille. */
async function installmentsOf(enrollmentId: string) {
  return currentTx()
    .select()
    .from(installments)
    .where(eq(installments.enrollmentId, enrollmentId))
    .orderBy(asc(installments.sequence), asc(installments.kind));
}

/**
 * Inscription du contrat (onglet Souscripteurs, réponse de en.create) : statuts des échéances par installmentStatus()
 * au jour de l'association, totaux par enrollmentTotals(), situation par memberStanding() ; un compte non activé et à
 * jour est « activation en attente » (domain-rules § 7).
 */
export async function toEnrollment(
  row: EnrollmentRecord,
  project: ProjectRecord,
  member: SubscriberContact,
  today: IsoDate,
): Promise<Enrollment> {
  const currency = project.currency as Currency;
  const lines = (await installmentsOf(row.id)).map((i) => {
    const amountDue = Money.fromDb(i.amountDue, currency).amount;
    const amountPaid = Money.fromDb(i.amountPaid, currency).amount;
    const amountPending = Money.fromDb(i.amountPending, currency).amount;
    const status = installmentStatus(
      { dueDate: i.dueDate, amountDue, amountPaid, amountPending, status: i.status },
      today,
      project.graceDays,
    );
    return { amountDue, amountPaid, status };
  });
  const totals = enrollmentTotals(lines, project.scheduleType);
  const standing = memberStanding(
    row.status,
    lines.map((l) => l.status),
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
