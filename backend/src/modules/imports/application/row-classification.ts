import { importRows } from '@cotiz/db';
import { and, asc, eq, inArray, lt, sql } from 'drizzle-orm';
import { accountsByPhones } from '../../identity/identity.public.js';
import { enrolledUserIdsOf } from '../../members/members.public.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { checkRow, type RowError, valuesOf } from '../domain/row-check.js';
import {
  type ImportJobRecord,
  type ImportRowRecord,
  mappingOf,
  type StoredRow,
  storedRowOf,
} from './import-records.js';

type Category = (typeof importRows.category.enumValues)[number];

export interface ClassifiedRow {
  id: string;
  category: Category;
  normalized: StoredRow;
  errors: RowError[];
  resolvedUserId: string | null;
}

/** Comptes refusés par en.create (désactivés, anonymisés) : la ligne ne pourra pas être inscrite. */
const CLOSED = new Set(['disabled', 'anonymized']);

/**
 * Classement des lignes (architecture/04 § 4.8), dans l'ordre du fichier :
 * - `ignored` : écartée par le gestionnaire, le reste ;
 * - `error` : champ obligatoire absent, trop long, téléphone ou email invalide ; compte du téléphone fermé ; personne
 *   déjà inscrite au projet (`already_enrolled`, comme en.create) ;
 * - `duplicate` : même téléphone qu'une ligne précédente retenue (ni ignorée ni en erreur) ;
 * - `existing` : un compte a ce téléphone, il sera rattaché ; `ready` : nouveau compte.
 * Les corrections du gestionnaire (`normalized.corrections`) priment sur le fichier.
 */
export async function classifyRows(
  job: ImportJobRecord,
  rows: readonly ImportRowRecord[],
  country: string,
): Promise<ClassifiedRow[]> {
  const mapping = mappingOf(job);
  const firstByPhone = new Map<string, number>();
  const pending: { row: ClassifiedRow; phone: string }[] = [];
  const result: ClassifiedRow[] = [];
  for (const [index, row] of rows.entries()) {
    // Rend la main toutes les 500 lignes : 5 000 téléphones relus ne monopolisent pas le processus.
    if (index > 0 && index % 500 === 0) await new Promise((resolve) => setImmediate(resolve));
    const corrections = storedRowOf(row)?.corrections ?? {};
    const check = checkRow(valuesOf(row.raw, mapping, corrections), country);
    const normalized: StoredRow = { values: check.values, corrections, phone: check.phone, duplicateOf: null };
    const classified: ClassifiedRow = {
      id: row.id,
      category: 'ready',
      normalized,
      errors: check.errors,
      resolvedUserId: null,
    };
    result.push(classified);
    if (row.category === 'ignored') classified.category = 'ignored';
    else if (check.errors.length > 0 || check.phone === null) classified.category = 'error';
    else if (firstByPhone.has(check.phone)) {
      classified.category = 'duplicate';
      normalized.duplicateOf = firstByPhone.get(check.phone) ?? null;
    } else {
      firstByPhone.set(check.phone, row.rowNumber);
      pending.push({ row: classified, phone: check.phone });
    }
  }
  await resolveAccounts(job.projectId, pending);
  return result;
}

/** Une ligne corrigée ou rétablie (`im.steps`, row) : contrôlée seule, doublon cherché parmi les lignes précédentes. */
export async function classifyRow(job: ImportJobRecord, row: ImportRowRecord, country: string): Promise<ClassifiedRow> {
  const corrections = storedRowOf(row)?.corrections ?? {};
  const check = checkRow(valuesOf(row.raw, mappingOf(job), corrections), country);
  const normalized: StoredRow = { values: check.values, corrections, phone: check.phone, duplicateOf: null };
  const classified: ClassifiedRow = {
    id: row.id,
    category: 'ready',
    normalized,
    errors: check.errors,
    resolvedUserId: null,
  };
  if (check.errors.length > 0 || check.phone === null) {
    classified.category = 'error';
    return classified;
  }
  const [earlier] = await currentTx()
    .select({ rowNumber: importRows.rowNumber })
    .from(importRows)
    .where(
      and(
        eq(importRows.importJobId, job.id),
        lt(importRows.rowNumber, row.rowNumber),
        inArray(importRows.category, ['ready', 'existing']),
        sql`${importRows.normalized} ->> 'phone' = ${check.phone}`,
      ),
    )
    .orderBy(asc(importRows.rowNumber))
    .limit(1);
  if (earlier) {
    classified.category = 'duplicate';
    normalized.duplicateOf = earlier.rowNumber;
    return classified;
  }
  await resolveAccounts(job.projectId, [{ row: classified, phone: check.phone }]);
  return classified;
}

async function resolveAccounts(projectId: string, pending: { row: ClassifiedRow; phone: string }[]): Promise<void> {
  const accounts = await accountsByPhones(pending.map((p) => p.phone));
  const enrolled = await enrolledUserIdsOf(
    projectId,
    [...accounts.values()].map((a) => a.id),
  );
  for (const { row, phone } of pending) {
    const account = accounts.get(phone);
    if (!account) continue;
    row.resolvedUserId = account.id;
    if (CLOSED.has(account.status)) {
      row.category = 'error';
      row.errors.push({ field: 'phone', code: 'account_closed' });
    } else if (enrolled.has(account.id)) {
      row.category = 'error';
      row.errors.push({ field: null, code: 'already_enrolled' });
    } else row.category = 'existing';
  }
}

/** Écrit le classement en une instruction (5 000 lignes). */
export async function saveClassification(rows: readonly ClassifiedRow[]): Promise<void> {
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK).map((r) => ({
      id: r.id,
      category: r.category,
      normalized: r.normalized,
      errors: r.errors,
      uid: r.resolvedUserId,
    }));
    await currentTx().execute(sql`
      UPDATE import_rows AS r
         SET category = x.category::import_rows_category, normalized = x.normalized, errors = x.errors,
             resolved_user_id = x.uid
        FROM jsonb_to_recordset(${JSON.stringify(batch)}::jsonb)
             AS x(id uuid, category text, normalized jsonb, errors jsonb, uid uuid)
       WHERE r.id = x.id`);
  }
}
