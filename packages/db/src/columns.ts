import { newId } from '@cotiz/domain';
import { sql } from 'drizzle-orm';
import { integer, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Colonnes communes des tables (docs/specs/schema.sql), à reprendre dans chaque définition Drizzle :
 * `id: id(), …, createdAt: createdAt(), updatedAt: updatedAt(), version: version()`.
 */

/** Clé primaire UUID v7 générée par l'application (newId), sans DEFAULT en base : PostgreSQL 16 n'a pas uuidv7(). */
export const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => newId());

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * Rafraîchie à chaque UPDATE fait par Drizzle, à l'heure de la transaction (now()) ; schema.sql ne pose le
 * déclencheur touch_updated_at que sur users, associations et payments.
 */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => sql`now()`);

/** Version du verrou optimiste (ETag `W/"<version>"`, If-Match) : modifiée par updateWithVersion() seulement. */
export const version = () => integer('version').notNull().default(1);
