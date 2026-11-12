import type { ImportField, ImportFailure, ImportJob, ImportRow } from '@cotiz/contracts';
import { importJobs, importRows } from '@cotiz/db';
import { and, asc, count, eq } from 'drizzle-orm';
import type { z } from 'zod';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { type ImportValues, type RowError, valuesOf } from '../domain/row-check.js';

type Field = z.infer<typeof ImportField>;
type Category = (typeof importRows.category.enumValues)[number];
export type ImportJobRecord = typeof importJobs.$inferSelect;
export type ImportRowRecord = typeof importRows.$inferSelect;

/** `column_mapping` : colonnes du fichier dans l'ordre, 3 exemples, champ Cotiz retenu. */
export interface StoredColumn {
  name: string;
  samples: string[];
  field: Field | null;
}

export interface Progress {
  total: number;
  processed: number;
  enrolled: number;
  attached: number;
  failed: number;
}

/** `counts` : lignes par catégorie, progression de l'exécution, motif d'échec. */
export interface StoredCounts {
  ready?: number;
  existing?: number;
  error?: number;
  duplicate?: number;
  ignored?: number;
  /** Lignes inscrites (schema.sql : `imported`), égal à enrolled + attached. */
  imported?: number;
  progress?: Progress;
  failure?: z.infer<typeof ImportFailure>;
}

/** `normalized` d'une ligne : valeurs retenues, corrections, téléphone E.164, doublon, résultat de l'exécution. */
export interface StoredRow {
  values: ImportValues;
  corrections: ImportValues;
  phone: string | null;
  duplicateOf: number | null;
  outcome?: 'enrolled' | 'attached' | 'failed';
  enrollmentId?: string;
}

export const CATEGORIES: readonly Category[] = ['ready', 'existing', 'error', 'duplicate', 'ignored'];

export const columnsOf = (job: ImportJobRecord) => job.columnMapping as StoredColumn[];
export const countsOf = (job: ImportJobRecord) => job.counts as StoredCounts;
export const mappingOf = (job: ImportJobRecord): Record<string, Field | null> =>
  Object.fromEntries(columnsOf(job).map((c) => [c.name, c.field]));
export const storedRowOf = (row: ImportRowRecord) => row.normalized as StoredRow | null;

/** Import `id` de l'association (RLS et filtre), verrouillé si demandé ; `null` s'il n'existe pas pour elle. */
export async function importOf(
  associationId: string,
  id: string,
  options: { lock?: boolean } = {},
): Promise<ImportJobRecord | null> {
  const query = currentTx()
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.associationId, associationId), eq(importJobs.id, id)));
  const [row] = await (options.lock ? query.for('update') : query);
  return row ?? null;
}

/** Lignes de l'import, dans l'ordre du fichier. */
export function rowsOf(importId: string): Promise<ImportRowRecord[]> {
  return currentTx()
    .select()
    .from(importRows)
    .where(eq(importRows.importJobId, importId))
    .orderBy(asc(importRows.rowNumber));
}

/** Lignes par catégorie, comptées en base. */
export async function categoryCounts(importId: string): Promise<Record<Category, number>> {
  const rows = await currentTx()
    .select({ category: importRows.category, n: count() })
    .from(importRows)
    .where(eq(importRows.importJobId, importId))
    .groupBy(importRows.category);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const r of rows) counts[r.category] = r.n;
  return counts;
}

/** Recompte les catégories dans `counts` (progression et motif conservés). */
export async function refreshCounts(job: ImportJobRecord): Promise<StoredCounts> {
  const counts: StoredCounts = { ...countsOf(job), ...(await categoryCounts(job.id)) };
  await currentTx().update(importJobs).set({ counts }).where(eq(importJobs.id, job.id));
  return counts;
}

export function toImportJob(job: ImportJobRecord): z.infer<typeof ImportJob> {
  const counts = countsOf(job);
  return {
    id: job.id,
    projectId: job.projectId,
    sourceFileId: job.sourceFileId,
    status: job.status,
    columns: columnsOf(job).map((c) => ({ name: c.name, samples: c.samples, field: c.field })),
    counts: Object.fromEntries(CATEGORIES.map((c) => [c, counts[c] ?? 0])) as Record<Category, number>,
    progress: counts.progress ?? null,
    failure: counts.failure ?? null,
    createdAt: job.createdAt.toISOString(),
  };
}

/** Ligne telle que l'écran la montre ; pas encore classée : valeurs lues avec la correspondance courante. */
export function toImportRow(row: ImportRowRecord, job: ImportJobRecord): z.infer<typeof ImportRow> {
  const stored = storedRowOf(row);
  const values = stored?.values ?? valuesOf(row.raw, mappingOf(job));
  return {
    id: row.id,
    rowNumber: row.rowNumber,
    category: row.category,
    values,
    errors: (row.errors ?? []) as RowError[],
    duplicateOf: row.category === 'duplicate' ? (stored?.duplicateOf ?? null) : null,
    existingUserId: row.category === 'existing' ? row.resolvedUserId : null,
  };
}
