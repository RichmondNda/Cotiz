import { Injectable } from '@nestjs/common';
import { OutboxService } from '../../../shared/outbox/index.js';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { failImport } from './analyze-import.use-case.js';
import { importOf } from './import-records.js';

/** Statuts d'un import qu'un job du worker fait avancer : un échec définitif du job le laisse en échec. */
const IN_PROGRESS = new Set(['uploaded', 'mapped', 'importing']);

/**
 * Job de la file `imports` en échec après toutes ses tentatives (erreur imprévue) : l'import passe `failed`
 * (`internal`) et le gestionnaire est prévenu (`import.failed`), au lieu de tourner indéfiniment à l'écran. Les lignes
 * déjà inscrites le restent.
 */
@Injectable()
export class FailImportUseCase {
  constructor(
    private readonly db: TenantDatabase,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: { associationId: string; importId: string }): Promise<void> {
    await this.db.withTenantContext({ space: 'association', associationId: input.associationId }, async () => {
      const job = await importOf(input.associationId, input.importId, { lock: true });
      if (job && IN_PROGRESS.has(job.status)) await failImport(this.outbox, job, 'internal');
    });
  }
}
