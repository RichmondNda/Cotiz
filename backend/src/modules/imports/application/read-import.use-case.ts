import { Injectable } from '@nestjs/common';
import type { ImportJob, ImportRow, ImportRowCategory, ListQuery } from '@cotiz/contracts';
import { importRows } from '@cotiz/db';
import { and, asc, count, eq, gt } from 'drizzle-orm';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { importOf, toImportJob, toImportRow } from './import-records.js';

type RowsQuery = ListQuery & { category?: z.infer<typeof ImportRowCategory> | undefined };

/** Curseur des lignes : numéro de la dernière ligne servie (ordre du fichier). */
const encodeRowCursor = (rowNumber: number) => Buffer.from(JSON.stringify({ r: rowNumber })).toString('base64url');
function decodeRowCursor(cursor: string): number | null {
  try {
    const value = (JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { r?: unknown }).r;
    return Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null;
  } catch {
    return null;
  }
}

/**
 * im.read : un import (statut, colonnes, compteurs, progression), interrogé toutes les 2 s par l'écran pendant
 * l'analyse et l'envoi ; ses lignes par catégorie, dans l'ordre du fichier, par pages. Import d'une autre association
 * ou inconnu : 404.
 */
@Injectable()
export class ReadImportUseCase {
  async get(aid: string, id: string): Promise<z.infer<typeof ImportJob>> {
    const job = await importOf(contextAssociationId(aid), id);
    if (!job) throw new DomainProblem('not_found');
    return toImportJob(job);
  }

  async rows(
    aid: string,
    id: string,
    query: RowsQuery,
  ): Promise<{ items: z.infer<typeof ImportRow>[]; nextCursor: string | null; total: number }> {
    const job = await importOf(contextAssociationId(aid), id);
    if (!job) throw new DomainProblem('not_found');
    if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
    const after = query.cursor === undefined ? 0 : decodeRowCursor(query.cursor);
    if (after === null) throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });

    const filter = and(
      eq(importRows.importJobId, job.id),
      query.category === undefined ? undefined : eq(importRows.category, query.category),
    );
    const page = await currentTx()
      .select()
      .from(importRows)
      .where(and(filter, gt(importRows.rowNumber, after)))
      .orderBy(asc(importRows.rowNumber))
      .limit(query.limit + 1);
    const [total] = await currentTx().select({ n: count() }).from(importRows).where(filter);
    const items = page.slice(0, query.limit);
    const last = items.at(-1);
    return {
      items: items.map((row) => toImportRow(row, job)),
      nextCursor: page.length > query.limit && last ? encodeRowCursor(last.rowNumber) : null,
      total: total?.n ?? 0,
    };
  }
}
