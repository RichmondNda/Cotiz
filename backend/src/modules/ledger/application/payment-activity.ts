import { payments } from '@cotiz/db';
import { and, eq, sql } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

export interface PaymentActivity {
  /** Paiements déclarés pendant la journée (tout statut d'aujourd'hui). */
  declared: number;
  /** Paiements validés pendant la journée (relecture du jour, toujours validés). */
  validated: number;
  /** Délai moyen déclaration → validation des paiements validés du jour, en heures à 0,1 près ; 0 sans validation. */
  avgValidationHours: number;
}

/**
 * Paiements déclarés et validés pendant le jour local `day` (fuseau `timezone`) dans l'association du contexte (RLS) :
 * statistiques d'usage (usage_daily, lot 4.6). Indicateurs de volume et de délai, aucun montant.
 */
export async function paymentActivityOf(
  associationId: string,
  day: string,
  timezone: string,
): Promise<PaymentActivity> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId !== associationId) {
    throw new Error('paymentActivityOf : contexte de cette association attendu');
  }
  const from = sql`(${day}::date::timestamp AT TIME ZONE ${timezone})`;
  const to = sql`((${day}::date + 1)::timestamp AT TIME ZONE ${timezone})`;
  const validatedToday = sql`${payments.status} = 'validated' AND ${payments.reviewedAt} >= ${from} AND ${payments.reviewedAt} < ${to}`;
  const [row] = await currentTx()
    .select({
      declared:
        sql<number>`count(*) FILTER (WHERE ${payments.declaredAt} >= ${from} AND ${payments.declaredAt} < ${to})`.mapWith(
          Number,
        ),
      validated: sql<number>`count(*) FILTER (WHERE ${validatedToday})`.mapWith(Number),
      avgValidationHours:
        sql<number>`coalesce(round((avg(extract(epoch FROM ${payments.reviewedAt} - ${payments.declaredAt}))
        FILTER (WHERE ${validatedToday}) / 3600)::numeric, 1), 0)`.mapWith(Number),
    })
    .from(payments)
    .where(
      and(
        eq(payments.associationId, associationId),
        sql`(${payments.declaredAt} >= ${from} AND ${payments.declaredAt} < ${to}
             OR ${payments.reviewedAt} >= ${from} AND ${payments.reviewedAt} < ${to})`,
      ),
    );
  return row ?? { declared: 0, validated: 0, avgValidationHours: 0 };
}
