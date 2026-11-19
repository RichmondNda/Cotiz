import { Injectable } from '@nestjs/common';
import { exportJobs } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';

/**
 * Export en échec définitif (tentatives de la file `exports` épuisées : moteur PDF indisponible, stockage injoignable) :
 * `failed`, seulement s'il était encore en attente ou en cours. L'écran le montre ; une nouvelle demande est possible.
 */
@Injectable()
export class FailExportUseCase {
  constructor(private readonly db: TenantDatabase) {}

  async execute(job: { associationId: string; exportId: string }): Promise<void> {
    await this.db.withTenantContext({ space: 'association', associationId: job.associationId }, () =>
      currentTx()
        .update(exportJobs)
        .set({ status: 'failed' })
        .where(
          and(
            eq(exportJobs.id, job.exportId),
            eq(exportJobs.associationId, job.associationId),
            inArray(exportJobs.status, ['queued', 'running']),
          ),
        ),
    );
  }
}
