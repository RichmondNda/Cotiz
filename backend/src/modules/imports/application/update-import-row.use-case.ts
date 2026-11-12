import { Injectable } from '@nestjs/common';
import type { ImportField, ImportRow } from '@cotiz/contracts';
import { importRows } from '@cotiz/db';
import { and, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { importOf, refreshCounts, storedRowOf, toImportRow } from './import-records.js';
import { classifyRow, saveClassification } from './row-classification.js';

type Field = z.infer<typeof ImportField>;

/**
 * im.steps (row) : correction d'une ligne (valeurs qui priment sur le fichier) ou décision de l'ignorer / la reprendre,
 * une fois les lignes classées (`validated`, sinon 409 `invalid_state`). La ligne est recontrôlée tout de suite : prête,
 * compte existant, erreur ou doublon d'une ligne précédente ; compteurs recalculés. Corps vide : 422.
 */
@Injectable()
export class UpdateImportRowUseCase {
  async execute(
    aid: string,
    id: string,
    rowId: string,
    input: { values?: Partial<Record<Field, string>> | undefined; ignore?: boolean | undefined },
  ): Promise<z.infer<typeof ImportRow>> {
    const associationId = contextAssociationId(aid);
    if (input.values === undefined && input.ignore === undefined) {
      throw new DomainProblem('validation_failed', { fields: { body: 'required' } });
    }
    const job = await importOf(associationId, id, { lock: true });
    if (!job) throw new DomainProblem('not_found');
    const [row] = await currentTx()
      .select()
      .from(importRows)
      .where(and(eq(importRows.importJobId, job.id), eq(importRows.id, rowId)))
      .for('update');
    if (!row) throw new DomainProblem('not_found');
    if (job.status !== 'validated') throw new DomainProblem('invalid_state');

    const stored = storedRowOf(row);
    const corrections = { ...(stored?.corrections ?? {}), ...(input.values ?? {}) };
    const base = { ...row, normalized: { ...(stored ?? {}), corrections } };
    const association = await ownAssociationOf(associationId);
    if (!association) throw new DomainProblem('not_found');
    const classified = await classifyRow(job, base, association.country);
    if (input.ignore === true || (input.ignore === undefined && row.category === 'ignored')) {
      classified.category = 'ignored';
    }
    await saveClassification([classified]);
    await refreshCounts(job);
    const [updated] = await currentTx().select().from(importRows).where(eq(importRows.id, row.id));
    if (!updated) throw new DomainProblem('not_found');
    return toImportRow(updated, job);
  }
}
