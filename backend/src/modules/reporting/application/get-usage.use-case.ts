import { Injectable } from '@nestjs/common';
import type { UsageDay } from '@cotiz/contracts';
import { type IsoDate, todayIn, usagePeriod } from '@cotiz/domain';
import { usageDaily } from '@cotiz/db';
import { and, asc, between, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { platformAssociationOf } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/**
 * pf.asso.usage : statistiques d'usage quotidiennes d'une association, lues par la plateforme (connexion
 * cotiz_platform). Par défaut les 30 derniers jours finis (jour de l'association) ; seuls les jours calculés par
 * `usage.daily` sont rendus, du plus ancien au plus récent. Association inconnue : 404 ; période inversée ou de plus
 * de 366 jours : 422.
 */
@Injectable()
export class GetUsageUseCase {
  async execute(id: string, query: { from?: IsoDate; to?: IsoDate }): Promise<{ days: z.infer<typeof UsageDay>[] }> {
    if (currentContext()?.space !== 'platform') throw new Error('pf.asso.usage : espace plateforme seulement');
    const association = await platformAssociationOf(id);
    if (!association) throw new DomainProblem('not_found');
    const period = usagePeriod(query, todayIn(association.timezone));
    if ('issue' in period) {
      throw new DomainProblem('validation_failed', {
        fields: period.issue === 'from_after_to' ? { to: 'before_from' } : { from: 'too_long' },
      });
    }
    const rows = await currentTx()
      .select()
      .from(usageDaily)
      .where(and(eq(usageDaily.associationId, association.id), between(usageDaily.day, period.from, period.to)))
      .orderBy(asc(usageDaily.day));
    return {
      days: rows.map((r) => ({
        day: r.day,
        logins: r.logins,
        activeUsers: r.activeUsers,
        paymentsDeclared: r.paymentsDeclared,
        paymentsValidated: r.paymentsValidated,
        avgValidationHours: Number(r.avgValidationHours),
      })),
    };
  }
}
