import { foreignKey, inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id, version } from '../columns.js';
import { files } from './files.js';
import { users } from './identity.js';
import { enrollments } from './members.js';
import { projects } from './projects.js';
import { associations } from './tenancy.js';

// Module contracts (docs/specs/schema.sql, lot 4.1 ; migration 0015).

/**
 * Contrat d'un projet (un au plus par projet). Immuable une fois verrouillé (déclencheur contracts_locked →
 * `contract_locked`). RLS : l'association ; le souscripteur lit celui des projets où il est inscrit. Le projet est de
 * l'association de la ligne (clé composite).
 */
export const contracts = pgTable(
  'contracts',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    projectId: uuid('project_id').notNull().unique(),
    /** Markdown avec variables `{nom_souscripteur}`, `{montant}`… */
    bodyTemplate: text('body_template').notNull(),
    /** Empreinte du modèle verrouillé. */
    templateSha256: text('template_sha256').notNull(),
    associationSignerName: text('association_signer_name').notNull(),
    associationSignerTitle: text('association_signer_title').notNull(),
    associationSignedBy: uuid('association_signed_by').references(() => users.id),
    associationSignedAt: timestamp('association_signed_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    /** Verrouillage optimiste (If-Match de ct.get), écrit par updateWithVersion. */
    version: version(),
    createdAt: createdAt(),
  },
  (t) => [
    foreignKey({ columns: [t.projectId, t.associationId], foreignColumns: [projects.id, projects.associationId] }),
  ],
);

/**
 * Contre-signature d'un souscripteur, avec éléments de preuve. En ajout seul (droits retirés, déclencheurs
 * forbid_mutation). Une par inscription. RLS : l'association ; le souscripteur lit les siennes et n'insère que celle de
 * son inscription en attente, sur le contrat verrouillé de son projet, avec son propre PDF (espace subscriber).
 */
export const contractSignatures = pgTable('contract_signatures', {
  id: id(),
  associationId: uuid('association_id')
    .notNull()
    .references(() => associations.id),
  contractId: uuid('contract_id')
    .notNull()
    .references(() => contracts.id),
  enrollmentId: uuid('enrollment_id')
    .notNull()
    .unique()
    .references(() => enrollments.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  /** Empreinte du contrat personnalisé tel qu'affiché. */
  renderedSha256: text('rendered_sha256').notNull(),
  renderedBody: text('rendered_body').notNull(),
  /** « J'ai lu et j'accepte… » exact au moment de la signature. */
  consentText: text('consent_text').notNull(),
  signedAt: timestamp('signed_at', { withTimezone: true }).notNull(),
  ip: inet('ip'),
  userAgent: text('user_agent'),
  /** PDF signé avec page de preuve (ligne `files` créée juste avant la signature, complétée par le worker). */
  pdfFileId: uuid('pdf_file_id')
    .notNull()
    .unique()
    .references(() => files.id),
  createdAt: createdAt(),
});
