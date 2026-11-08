import { runMigrations } from '@cotiz/db/migrate';
import { startTestDatabase } from '@cotiz/db/testing';
import type { TestProject } from 'vitest/node';
import './shared-postgres.js';

/**
 * Démarre UN PostgreSQL pour toute l'exécution et y migre la base modèle (voir `shared-postgres.ts`).
 * COTIZ_TEST_SHARED_PG=0, ou Docker absent : rien n'est partagé, chaque fichier démarre son conteneur comme avant.
 */
export default async function setup(project: TestProject): Promise<(() => Promise<void>) | undefined> {
  if (process.env.COTIZ_TEST_SHARED_PG === '0') {
    project.provide('sharedPostgres', null);
    return undefined;
  }
  let db;
  try {
    db = await startTestDatabase({ maxConnections: 500 });
  } catch (error) {
    console.warn(`PostgreSQL partagé indisponible (${(error as Error).message}) : un conteneur par fichier.`);
    project.provide('sharedPostgres', null);
    return undefined;
  }
  await runMigrations(db.urlFor('cotiz_migrator'));
  const adminUrl = new URL(db.superuserUrl);
  adminUrl.pathname = '/postgres';
  project.provide('sharedPostgres', { adminUrl: adminUrl.toString(), template: db.container.getDatabase() });
  return async () => {
    await db.container.stop();
  };
}
