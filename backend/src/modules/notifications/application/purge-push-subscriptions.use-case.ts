import { Injectable } from '@nestjs/common';
import { pushSubscriptions } from '@cotiz/db';
import { lt } from 'drizzle-orm';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/** Un abonnement désactivé est gardé ce temps pour comprendre un incident, puis supprimé (aucune donnée financière). */
export const REVOKED_PUSH_RETENTION_DAYS = 30;

/**
 * Tâche hebdomadaire `push.cleanup` (jobs.yaml, lot 4.2) : supprime les abonnements Web Push désactivés (404/410,
 * 5 échecs, désabonnement) depuis plus de 30 jours. Espace system.
 */
@Injectable()
export class PurgePushSubscriptionsUseCase {
  constructor(private readonly db: TenantDatabase) {}

  async execute(now: Date): Promise<number> {
    const before = new Date(now.getTime() - REVOKED_PUSH_RETENTION_DAYS * 24 * 3_600_000);
    return this.db.withTenantContext({ space: 'system' }, async () => {
      const removed = await currentTx()
        .delete(pushSubscriptions)
        .where(lt(pushSubscriptions.revokedAt, before))
        .returning({ id: pushSubscriptions.id });
      return removed.length;
    });
  }
}
