import { Injectable } from '@nestjs/common';
import type { ImportField, ImportJob } from '@cotiz/contracts';
import { importJobs } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { DomainProblem, requireActor } from '../../../shared/http/index.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { mappingProblem } from '../domain/row-check.js';
import { columnsOf, importOf, mappingOf, toImportJob } from './import-records.js';

type Field = z.infer<typeof ImportField>;

/** Correspondance modifiable tant que l'envoi n'est pas lancé, une fois les colonnes détectées. */
const EDITABLE = new Set(['mapped', 'validated']);

/**
 * im.steps (mapping) : correspondance des colonnes, fusionnée avec la courante (colonnes absentes du corps : inchangées).
 * Colonne inconnue, prénom, nom ou téléphone sans colonne, deux colonnes sur un champ : 422 `validation_failed`.
 * L'import repasse `mapped` et le worker reclasse les lignes (`import.mapped`) ; analyse en cours, envoi lancé ou
 * import terminé : 409 `invalid_state`.
 */
@Injectable()
export class UpdateImportMappingUseCase {
  constructor(private readonly outbox: OutboxService) {}

  async execute(
    aid: string,
    id: string,
    input: { mapping: Record<string, Field | null> },
  ): Promise<z.infer<typeof ImportJob>> {
    const actor = requireActor();
    const associationId = contextAssociationId(aid);
    const job = await importOf(associationId, id, { lock: true });
    if (!job) throw new DomainProblem('not_found');
    if (!EDITABLE.has(job.status)) throw new DomainProblem('invalid_state');
    const columns = columnsOf(job);
    const mapping = { ...mappingOf(job), ...input.mapping };
    const problem = mappingProblem(
      mapping,
      columns.map((c) => c.name),
    );
    if (problem) throw new DomainProblem('validation_failed', { fields: problem });

    const [updated] = await currentTx()
      .update(importJobs)
      .set({ columnMapping: columns.map((c) => ({ ...c, field: mapping[c.name] ?? null })), status: 'mapped' })
      .where(eq(importJobs.id, job.id))
      .returning();
    if (!updated) throw new DomainProblem('not_found');
    await this.outbox.publish(currentTx(), {
      type: 'import.mapped',
      associationId,
      actorUserId: actor.userId,
      aggregate: { type: 'import', id: job.id },
      payload: { importId: job.id },
    });
    return toImportJob(updated);
  }
}
