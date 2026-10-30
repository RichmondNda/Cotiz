import { bigint, date, foreignKey, integer, pgEnum, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, id } from '../columns.js';
import { users } from './identity.js';
import { enrollments } from './members.js';
import { projects } from './projects.js';
import { associations } from './tenancy.js';

// Module ledger (docs/specs/schema.sql, lot 2.3 ; migration 0012). Valeurs des enums : celles du schéma cible
// (conformance.test.ts les compare).
export const installmentsKind = pgEnum('installments_kind', ['entry_fee', 'periodic']);
export const installmentsStatus = pgEnum('installments_status', [
  'upcoming',
  'due',
  'declared',
  'partial',
  'paid',
  'late',
  'waived',
  'canceled',
]);

/**
 * Échéance attendue (fonds d'entrée ou cotisation périodique) : une case de la grille. RLS : l'association, le
 * souscripteur sur ses lignes (espace subscriber), le worker. Montants en entiers de la devise (`bigint`) ; jamais
 * supprimée (REVOKE DELETE) ; contrôles des montants en base (installments_no_overcommit, _non_negative). Association, projet et personne sont ceux de l'inscription (clé composite).
 */
export const installments = pgTable(
  'installments',
  {
    id: id(),
    associationId: uuid('association_id')
      .notNull()
      .references(() => associations.id),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id),
    enrollmentId: uuid('enrollment_id').notNull(),
    /** Dénormalisé pour l'espace souscripteur. */
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    kind: installmentsKind('kind').notNull(),
    /** 0 = fonds d'entrée, puis 1, 2… : rang de la date dans le projet. */
    sequence: integer('sequence').notNull(),
    /** Dans le fuseau de l'association. */
    dueDate: date('due_date', { mode: 'string' }).notNull(),
    amountDue: bigint('amount_due', { mode: 'bigint' }).notNull(),
    amountPaid: bigint('amount_paid', { mode: 'bigint' }).notNull().default(0n),
    amountPending: bigint('amount_pending', { mode: 'bigint' }).notNull().default(0n),
    status: installmentsStatus('status').notNull().default('upcoming'),
    lateSince: date('late_since', { mode: 'string' }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    unique().on(t.enrollmentId, t.kind, t.sequence),
    foreignKey({
      columns: [t.enrollmentId, t.associationId, t.projectId, t.userId],
      foreignColumns: [enrollments.id, enrollments.associationId, enrollments.projectId, enrollments.userId],
    }),
  ],
);
