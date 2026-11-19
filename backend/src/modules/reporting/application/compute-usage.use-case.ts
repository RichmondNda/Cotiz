import { Injectable, Logger } from '@nestjs/common';
import { todayIn, USAGE_CATCH_UP_DAYS, usageDaysToCompute } from '@cotiz/domain';
import { usageDaily } from '@cotiz/db';
import { and, eq, gte, sql } from 'drizzle-orm';
import { activeSubscriberIdsOf, activeTeamIdsOf } from '../../access/access.public.js';
import { sessionUsageOf } from '../../identity/identity.public.js';
import { paymentActivityOf } from '../../ledger/ledger.public.js';
import { activeAssociationTimezones } from '../../tenancy/tenancy.public.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/**
 * Tâche `usage.daily` (jobs.yaml : quotidienne 02:00, lot 4.6) : passage horaire ; pour chaque association ni
 * suspendue ni fermée, les jours locaux finis des 7 derniers encore absents de usage_daily (la veille à partir de
 * 02:00 locale, @cotiz/domain) sont calculés dans le contexte de l'association (RLS) puis écrits une fois
 * (`ON CONFLICT DO NOTHING` : rejeu et passages simultanés sans doublon ni recalcul). Connexions et personnes actives
 * lues dans les sessions (gestion : owner/manager/viewer actifs ; espace souscripteur : souscripteurs actifs), paiements
 * déclarés et validés dans le registre. Aucun montant.
 */
@Injectable()
export class ComputeUsageUseCase {
  private readonly logger = new Logger(ComputeUsageUseCase.name);

  constructor(private readonly db: TenantDatabase) {}

  async execute(now: Date): Promise<number> {
    const associations = await this.db.withTenantContext({ space: 'system' }, () => activeAssociationTimezones());
    let written = 0;
    const failures: unknown[] = [];
    // Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise.
    for (const association of associations) {
      try {
        written += await this.db.withTenantContext({ space: 'association', associationId: association.id }, () =>
          this.compute(association.id, association.timezone, now),
        );
      } catch (error) {
        this.logger.error({ msg: 'usage non calculé', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (written > 0) this.logger.log({ msg: 'usage calculé', days: written });
    if (failures.length > 0) {
      throw new AggregateError(failures, `usage.daily : ${String(failures.length)} association(s) en échec`);
    }
    return written;
  }

  private async compute(associationId: string, timezone: string, now: Date): Promise<number> {
    const since = sql`${todayIn(timezone, now)}::date - ${USAGE_CATCH_UP_DAYS}::int`;
    const known = await currentTx()
      .select({ day: usageDaily.day })
      .from(usageDaily)
      .where(and(eq(usageDaily.associationId, associationId), gte(usageDaily.day, since)));
    const days = usageDaysToCompute(timezone, now, new Set(known.map((r) => r.day)));
    if (days.length === 0) return 0;
    const [team, subscribers] = await Promise.all([
      activeTeamIdsOf(associationId),
      activeSubscriberIdsOf(associationId),
    ]);
    let written = 0;
    for (const day of days) {
      const [managing, subscribing, paymentsOfDay] = [
        await sessionUsageOf({ space: 'association', userIds: team, day, timezone }),
        await sessionUsageOf({ space: 'subscriber', userIds: subscribers, day, timezone }),
        await paymentActivityOf(associationId, day, timezone),
      ];
      const inserted = await currentTx()
        .insert(usageDaily)
        .values({
          associationId,
          day,
          logins: managing.logins + subscribing.logins,
          activeUsers: new Set([...managing.activeUserIds, ...subscribing.activeUserIds]).size,
          paymentsDeclared: paymentsOfDay.declared,
          paymentsValidated: paymentsOfDay.validated,
          avgValidationHours: String(paymentsOfDay.avgValidationHours),
        })
        .onConflictDoNothing()
        .returning({ day: usageDaily.day });
      written += inserted.length;
    }
    return written;
  }
}
