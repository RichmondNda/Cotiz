import { Injectable } from '@nestjs/common';
import { type ImportFailure, UPLOAD_MAX_BYTES } from '@cotiz/contracts';
import { importJobs, importRows } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { importSourceOf } from '../../files/files.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { guessMapping, samplesOf, toImportTable } from '../domain/import-table.js';
import { mappingProblem } from '../domain/row-check.js';
import { type ImportJobRecord, importOf, refreshCounts, rowsOf, type StoredColumn } from './import-records.js';
import { classifyRows, saveClassification } from './row-classification.js';
import { readSpreadsheet } from '../infra/spreadsheet-reader.js';

type Failure = z.infer<typeof ImportFailure>;

/** Fichier encore en attente d'analyse antivirus au-delà de ce délai : refusé (antivirus absent ou en panne). */
const SCAN_TIMEOUT_MS = 30 * 60 * 1000;
const INSERT_CHUNK = 1000;

/**
 * Analyse d'un import (worker, `import.created`) : attend le verdict de l'antivirus sur le fichier (`wait` : le job est
 * repris quelques secondes plus tard), lit le CSV ou la première feuille XLSX, enregistre les lignes et les colonnes
 * détectées avec 3 exemples et la correspondance proposée (`mapped`). Correspondance complète (prénom, nom, téléphone)
 * : lignes classées dans la foulée (`validated`). Fichier refusé, illisible, vide ou trop long : `failed` et
 * `import.failed`. Idempotente : un import déjà analysé n'est pas repris.
 */
@Injectable()
export class AnalyzeImportUseCase {
  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

  async execute(input: { associationId: string; importId: string }, now = new Date()): Promise<'done' | 'wait'> {
    const context = { space: 'association' as const, associationId: input.associationId };
    const source = await this.db.withTenantContext(context, async () => {
      const job = await importOf(input.associationId, input.importId);
      if (job?.status !== 'uploaded') return null;
      const file = await importSourceOf(job.sourceFileId);
      if (file?.scanStatus === 'pending') {
        return now.getTime() - file.createdAt.getTime() > SCAN_TIMEOUT_MS
          ? ('file_rejected' as const)
          : ('wait' as const);
      }
      if (file?.scanStatus !== 'clean') return 'file_rejected' as const;
      return file;
    });
    if (source === null) return 'done';
    if (source === 'wait') return 'wait';

    let outcome: Failure | { headers: string[]; lines: { rowNumber: number; cells: Record<string, string> }[] };
    if (source === 'file_rejected') outcome = 'file_rejected';
    else {
      const content = await this.storage.getObject(source.bucket, source.objectKey, UPLOAD_MAX_BYTES);
      const sheet = content ? await readSpreadsheet(content, source.mimeType) : 'unreadable';
      outcome = typeof sheet === 'string' ? sheet : toImportTable(sheet);
    }

    await this.db.withTenantContext(context, async () => {
      const job = await importOf(input.associationId, input.importId, { lock: true });
      if (job?.status !== 'uploaded') return;
      if (typeof outcome === 'string') {
        await failImport(this.outbox, job, outcome);
        return;
      }
      const { headers, lines } = outcome;
      const guessed = guessMapping(headers);
      const columns: StoredColumn[] = headers.map((name) => ({
        name,
        samples: samplesOf(lines, name),
        field: guessed[name] ?? null,
      }));
      for (let i = 0; i < lines.length; i += INSERT_CHUNK) {
        await currentTx()
          .insert(importRows)
          .values(
            lines.slice(i, i + INSERT_CHUNK).map((line) => ({
              importJobId: job.id,
              associationId: job.associationId,
              rowNumber: line.rowNumber,
              raw: line.cells,
              category: 'ready' as const,
            })),
          );
      }
      const [mapped] = await currentTx()
        .update(importJobs)
        .set({ columnMapping: columns, status: 'mapped' })
        .where(eq(importJobs.id, job.id))
        .returning();
      if (!mapped) return;
      if (mappingProblem(guessed, headers) === null) await classifyImport(mapped);
      else await refreshCounts(mapped);
    });
    return 'done';
  }
}

/**
 * Classe toutes les lignes d'un import `mapped` à la correspondance complète, puis le passe `validated` ; dans la
 * transaction en cours, import verrouillé par l'appelant (une modification de la correspondance attend la fin).
 */
export async function classifyImport(job: ImportJobRecord): Promise<void> {
  const association = await ownAssociationOf(job.associationId);
  if (!association) throw new Error('import : association illisible dans son contexte');
  const classified = await classifyRows(job, await rowsOf(job.id), association.country);
  await saveClassification(classified);
  await refreshCounts(job);
  await currentTx().update(importJobs).set({ status: 'validated' }).where(eq(importJobs.id, job.id));
}

/** Import en échec (`failed`, motif dans `counts`), `import.failed` pour le gestionnaire. */
export async function failImport(outbox: OutboxService, job: ImportJobRecord, failure: Failure): Promise<void> {
  await currentTx()
    .update(importJobs)
    .set({ status: 'failed', counts: { ...(job.counts as object), failure } })
    .where(eq(importJobs.id, job.id));
  await outbox.publish(currentTx(), {
    type: 'import.failed',
    associationId: job.associationId,
    actorUserId: null,
    aggregate: { type: 'import', id: job.id },
    payload: { importId: job.id, error: failure },
  });
}
