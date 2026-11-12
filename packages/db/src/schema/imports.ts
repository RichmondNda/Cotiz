import { integer, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { files } from './files.js';
import { users } from './identity.js';
import { associations } from './tenancy.js';

// Module imports (docs/specs/schema.sql, lot 4.4 ; migration 0024).

export const importJobsStatus = pgEnum('import_jobs_status', [
  'uploaded',
  'mapped',
  'validated',
  'importing',
  'completed',
  'failed',
]);

export const importRowsCategory = pgEnum('import_rows_category', [
  'ready',
  'existing',
  'error',
  'duplicate',
  'ignored',
]);

/**
 * Import d'un fichier de souscripteurs dans un projet. RLS : l'association seule (le worker travaille dans son
 * contexte). `column_mapping` : colonnes détectées dans le fichier et champ Cotiz retenu ; `counts` : lignes par
 * catégorie et progression de l'exécution ; `invite_channels` vide tant que le groupe 6 n'est pas activé.
 */
export const importJobs = pgTable('import_jobs', {
  id: id(),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  projectId: uuid('project_id').notNull(),
  sourceFileId: uuid('source_file_id')
    .notNull()
    .references(() => files.id),
  columnMapping: jsonb('column_mapping').$type<unknown>().notNull(),
  status: importJobsStatus('status').notNull().default('uploaded'),
  counts: jsonb('counts').$type<unknown>().notNull().default({}),
  inviteChannels: text('invite_channels').array().notNull(),
  createdBy: uuid('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
});

/** Ligne d'un import : valeurs lues (`raw`), valeurs retenues (`normalized`), catégorie et erreurs. */
export const importRows = pgTable('import_rows', {
  id: id(),
  importJobId: uuid('import_job_id')
    .notNull()
    .references(() => importJobs.id),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  rowNumber: integer('row_number').notNull(),
  raw: jsonb('raw').$type<Record<string, string>>().notNull(),
  normalized: jsonb('normalized').$type<unknown>(),
  category: importRowsCategory('category').notNull(),
  errors: jsonb('errors').$type<unknown[]>().default([]),
  resolvedUserId: uuid('resolved_user_id'),
  createdAt: createdAt(),
});
