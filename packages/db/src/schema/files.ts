import { sql } from 'drizzle-orm';
import { bigint, check, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Valeurs de docs/specs/schema.sql (conformance.test.ts compare les types enum migrés au schéma cible).
export const filesPurpose = pgEnum('files_purpose', [
  'payment_proof',
  'contract_pdf',
  'invoice_pdf',
  'export',
  'logo',
  'cover',
  'import_source',
  'bank_statement',
]);
export const filesScanStatus = pgEnum('files_scan_status', ['pending', 'clean', 'infected']);

/** Référentiel de tous les fichiers stockés dans MinIO (docs/specs/schema.sql, lot 0.5 ; migration 0003). */
export const files = pgTable(
  'files',
  {
    /** UUID v7 généré par l'application ; aussi le nom de l'objet (jamais le nom d'origine). */
    id: uuid('id').primaryKey(),
    associationId: uuid('association_id'),
    ownerUserId: uuid('owner_user_id').notNull(),
    purpose: filesPurpose('purpose').notNull(),
    bucket: text('bucket').notNull(),
    objectKey: text('object_key').notNull(),
    /** Affichage seulement. */
    originalName: text('original_name').notNull(),
    mimeType: text('mime_type').notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    /** Calculé par le worker ; `null` tant que l'analyse n'est pas faite. */
    sha256: text('sha256'),
    scanStatus: filesScanStatus('scan_status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [check('files_sha256_when_scanned', sql`${t.scanStatus} = 'pending' OR ${t.sha256} IS NOT NULL`)],
);
