import { readFile } from 'node:fs/promises';
import pg from 'pg';

/** Schéma cible normatif (docs/specs/schema.sql). */
export const SPEC_SCHEMA = new URL('../../../../docs/specs/schema.sql', import.meta.url);

/**
 * Charge docs/specs/schema.sql dans une base vide, en cotiz_migrator (rôles créés au préalable).
 * Sert aux tests qui ont besoin de tables des lots à venir (test de fumée), tant que les migrations ne les créent pas.
 */
export async function loadSpecSchema(connectionString: string): Promise<void> {
  const sql = await readFile(SPEC_SCHEMA, 'utf8');
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}
