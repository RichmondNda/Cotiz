import { and, eq, getTableName, type InferSelectModel, sql } from 'drizzle-orm';
import type {
  PgColumn,
  PgQueryResultHKT,
  PgTable,
  PgTableWithColumns,
  PgTransaction,
  TableConfig,
} from 'drizzle-orm/pg-core';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core/query-builders/update';

/**
 * If-Match périmé : la ligne a changé depuis sa lecture. Traduit en `version_conflict` (412,
 * docs/specs/errors.yaml) par la couche HTTP, en attendant DomainProblem (lot 0.5).
 */
export class VersionConflictError extends Error {
  override readonly name = 'VersionConflictError';
  readonly code = 'version_conflict' as const;

  /** Pas de version courante : errors.yaml ne prévoit aucun détail pour version_conflict. */
  constructor(readonly table: string) {
    super('version_conflict');
  }
}

const PROTECTED_COLUMNS = ['id', 'version', 'createdAt', 'updatedAt'] as const;
type ProtectedColumn = (typeof PROTECTED_COLUMNS)[number];

/** Table qui porte les colonnes communes `id` et `version` (columns.ts). */
export type VersionedTable<C extends TableConfig = TableConfig> = PgTableWithColumns<C> & {
  id: PgColumn;
  version: PgColumn;
};

/**
 * Mise à jour sous verrou optimiste : n'aboutit que si la ligne est encore à `version`, qu'elle incrémente.
 * - ligne modifiée entre-temps : VersionConflictError ;
 * - ligne absente ou invisible (RLS, autre association) : `null`, que l'appelant traduit en 404.
 * Deux mises à jour concurrentes de la même version : la seconde attend le verrou de ligne, relit la version
 * validée et échoue. Suppose READ COMMITTED (niveau de la transaction de contexte) : en REPEATABLE READ, la seconde
 * recevrait une erreur de sérialisation (40001).
 * `id`, `version`, `createdAt` et `updatedAt` ne viennent jamais des valeurs.
 * Pour un changement d'état (validation d'un paiement, architecture/04-flows.md § 4.5) : verrouiller d'abord
 * (`SELECT … FOR UPDATE`), contrôler l'état (409 prioritaire sur le 412), puis écrire avec updateWithVersion().
 * `tx` : la transaction de contexte de shared/tenant-context (`currentTx()`) ; un client hors transaction est refusé
 * par le type (`rollback`).
 */
export async function updateWithVersion<C extends TableConfig>(
  tx: Pick<PgTransaction<PgQueryResultHKT>, 'update' | 'select' | 'rollback'>,
  table: VersionedTable<C>,
  target: { id: string; version: number },
  values: Omit<PgUpdateSetSource<PgTableWithColumns<C>>, ProtectedColumn>,
): Promise<InferSelectModel<PgTableWithColumns<C>> | null> {
  // Colonnes tenues par ce verrou et par columns.ts : retirées même si un appelant contourne le type.
  const rest = Object.fromEntries(
    Object.entries(values).filter(([key]) => !(PROTECTED_COLUMNS as readonly string[]).includes(key)),
  );
  const updated = await tx
    .update(table)
    .set({ ...rest, version: sql`${table.version} + 1` } as PgUpdateSetSource<PgTableWithColumns<C>>)
    .where(and(eq(table.id, target.id), eq(table.version, target.version)))
    .returning();
  const [row] = updated as InferSelectModel<PgTableWithColumns<C>>[];
  if (row) return row;

  // Relue sous verrou pour départager la ligne absente (404) de la version périmée (412). FOR NO KEY UPDATE applique
  // aussi les politiques UPDATE : une ligne lisible mais non modifiable (member_read, subscriber_self_read…) reste
  // invisible, comme pour l'UPDATE, et ne révèle ni son existence ni sa version.
  const source: PgTable = table;
  const [current] = await tx
    .select({ version: table.version })
    .from(source)
    .where(eq(table.id, target.id))
    .for('no key update');
  if (!current) return null;
  throw new VersionConflictError(getTableName(table));
}
