import type { DB_ENUMS } from '@cotiz/contracts';
import { files } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

type FilePurpose = (typeof DB_ENUMS)['files_purpose'][number];

/**
 * Un fichier peut être rattaché par l'association du contexte (logo d'`as.patch`…) : le sien (RLS et contrôle ici), de
 * l'usage attendu, analysé sain. Un fichier en attente, infecté, d'une autre association ou inconnu : `false`.
 */
export async function isUsableAssociationFile(id: string, purpose: FilePurpose): Promise<boolean> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId === undefined) {
    throw new Error('isUsableAssociationFile : contexte d’une association attendu');
  }
  const [row] = await currentTx()
    .select({ associationId: files.associationId, purpose: files.purpose, scanStatus: files.scanStatus })
    .from(files)
    .where(eq(files.id, id));
  return row?.associationId === context.associationId && row.purpose === purpose && row.scanStatus === 'clean';
}

/**
 * Nom d'origine de chaque fichier de l'association du contexte (RLS et filtre ici), pour l'affichage ; les autres
 * identifiants sont absents du résultat.
 */
export async function fileNamesOf(ids: readonly string[]): Promise<Map<string, string>> {
  const context = currentContext();
  if (context?.space !== 'association' || context.associationId === undefined) {
    throw new Error('fileNamesOf : contexte d’une association attendu');
  }
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: files.id, name: files.originalName })
    .from(files)
    .where(and(eq(files.associationId, context.associationId), inArray(files.id, [...ids])));
  return new Map(rows.map((r) => [r.id, r.name]));
}
