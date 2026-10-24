import { Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/**
 * Tâche `stats.refresh` (jobs.yaml : toutes les 15 min, lot 1.4), espace system : rafraîchit les vues matérialisées
 * du tableau de bord plateforme par `refresh_platform_stats()` (SECURITY DEFINER : seul le propriétaire rafraîchit une
 * vue, PostgreSQL 16). Rafraîchissement concurrent : pf.dashboard reste lisible pendant ce temps. Idempotente.
 */
@Injectable()
export class RefreshPlatformStatsUseCase {
  private readonly logger = new Logger(RefreshPlatformStatsUseCase.name);

  constructor(private readonly db: TenantDatabase) {}

  async execute(): Promise<void> {
    const started = Date.now();
    await this.db.withTenantContext({ space: 'system' }, async () => {
      await currentTx().execute(sql`SELECT refresh_platform_stats()`);
    });
    this.logger.log({ msg: 'statistiques plateforme rafraîchies', durationMs: Date.now() - started });
  }
}
