import { Injectable } from '@nestjs/common';
import { TenantDatabase } from '../../../shared/tenant-context/index.js';
import { mappingProblem } from '../domain/row-check.js';
import { classifyImport } from './analyze-import.use-case.js';
import { columnsOf, importOf, mappingOf } from './import-records.js';

/**
 * Classement des lignes après un changement de correspondance (worker, `import.mapped`) : import `mapped` à la
 * correspondance complète → lignes reclassées, `validated`. Autre statut (déjà reclassé, envoi lancé) : sans effet.
 * Import verrouillé pendant le classement : une nouvelle correspondance attend, puis déclenche son propre classement.
 */
@Injectable()
export class ClassifyImportUseCase {
  constructor(private readonly db: TenantDatabase) {}

  async execute(input: { associationId: string; importId: string }): Promise<void> {
    await this.db.withTenantContext({ space: 'association', associationId: input.associationId }, async () => {
      const job = await importOf(input.associationId, input.importId, { lock: true });
      if (job?.status !== 'mapped') return;
      const headers = columnsOf(job).map((c) => c.name);
      if (mappingProblem(mappingOf(job), headers) !== null) return;
      await classifyImport(job);
    });
  }
}
