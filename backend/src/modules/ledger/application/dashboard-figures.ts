import type { PaymentSummary } from '@cotiz/contracts';
import { allocations, payments } from '@cotiz/db';
import { type Currency, type IsoDate, Money, type MonthlyReceipt } from '@cotiz/domain';
import { and, count, desc, eq, gte, min, sql } from 'drizzle-orm';
import type { SubscriberAccounts } from '../../identity/identity.public.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { paymentRefsOf, paymentSummary } from './payment-views.js';

// Lectures du registre pour le tableau de bord gestionnaire (as.dashboard, lot 2.6), dans la transaction de
// l'association du contexte (RLS). Les montants sont additionnés par @cotiz/domain (monthlyCollection).

function assertAssociation(what: string, associationId: string): void {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error(`${what} : contexte de cette association seulement`);
  }
}

/** File de validation : nombre de paiements en attente, la plus ancienne déclaration, et le nombre par projet. */
export async function pendingPaymentsOverviewOf(associationId: string): Promise<{
  count: number;
  oldestDeclaredAt: string | null;
  byProject: Map<string, number>;
  oldestByProject: Map<string, string>;
}> {
  assertAssociation('pendingPaymentsOverviewOf', associationId);
  const rows = await currentTx()
    .select({ projectId: payments.projectId, n: count(), oldest: min(payments.declaredAt) })
    .from(payments)
    .where(and(eq(payments.associationId, associationId), eq(payments.status, 'pending')))
    .groupBy(payments.projectId);
  const byProject = new Map(rows.map((r) => [r.projectId, r.n]));
  const oldest = rows
    .map((r) => r.oldest)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    count: rows.reduce((total, r) => total + r.n, 0),
    oldestDeclaredAt: oldest?.toISOString() ?? null,
    byProject,
    oldestByProject: new Map(rows.flatMap((r) => (r.oldest ? [[r.projectId, r.oldest.toISOString()] as const] : []))),
  };
}

/**
 * Reçu par mois de validation (fuseau de l'association), depuis `fromMonth` (premier jour du mois) : allocations
 * confirmées des paiements validés, une ligne par mois, projet et devise. Additionné par monthlyCollection().
 */
export async function monthlyReceiptsOf(
  associationId: string,
  timezone: string,
  fromMonth: IsoDate,
): Promise<(MonthlyReceipt & { projectId: string; currency: Currency })[]> {
  assertAssociation('monthlyReceiptsOf', associationId);
  const month = sql<string>`to_char(${payments.reviewedAt} AT TIME ZONE ${timezone}, 'YYYY-MM-01')`;
  const rows = await currentTx()
    .select({
      month,
      projectId: payments.projectId,
      currency: payments.currency,
      amount: sql<string>`sum(${allocations.amount})`,
    })
    .from(allocations)
    .innerJoin(payments, eq(payments.id, allocations.paymentId))
    .where(
      and(
        eq(allocations.associationId, associationId),
        eq(allocations.state, 'confirmed'),
        eq(payments.status, 'validated'),
        // Borne large (un jour de marge, tout fuseau) ; le mois exact est celui du fuseau, filtré par le domaine.
        gte(payments.reviewedAt, sql`(${fromMonth}::date - 1)::timestamptz`),
      ),
    )
    // Par position : le fuseau, passé en paramètre, ferait du mois une autre expression dans GROUP BY.
    .groupBy(sql`1`, sql`2`, sql`3`);
  return rows.map((r) => ({
    month: r.month,
    projectId: r.projectId,
    currency: r.currency as Currency,
    amount: Money.fromDb(r.amount, r.currency as Currency).amount,
  }));
}

/** Derniers paiements déclarés (tous statuts), les plus récents d'abord. */
export async function latestPaymentsOf(
  associationId: string,
  accounts: SubscriberAccounts,
  limit: number,
): Promise<PaymentSummary[]> {
  assertAssociation('latestPaymentsOf', associationId);
  const rows = await currentTx()
    .select()
    .from(payments)
    .where(eq(payments.associationId, associationId))
    .orderBy(desc(payments.declaredAt), desc(payments.id))
    .limit(limit);
  const refs = await paymentRefsOf(associationId, rows, accounts);
  return rows.map((row) => paymentSummary(row, refs));
}
