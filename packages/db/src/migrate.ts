import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../migrations', import.meta.url));

/** Applique les migrations en attente, en une transaction. Connexion directe (pas PgBouncer), rôle cotiz_migrator. */
export async function runMigrations(connectionString: string): Promise<void> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await client.end();
  }
}

// `pnpm db:migrate` : MIGRATION_DATABASE_URL vient de backend/.env.example, surchargé par backend/.env.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error('MIGRATION_DATABASE_URL : manquante');
    process.exit(1);
  }
  try {
    await runMigrations(url);
    console.log('Migrations appliquées.');
  } catch (error) {
    // Le message PostgreSQL seul : jamais l'URL de connexion, qui contient le mot de passe.
    let cause = error;
    while (cause instanceof Error && cause.cause instanceof Error) cause = cause.cause;
    console.error(`Échec des migrations : ${cause instanceof Error ? cause.message : String(cause)}`);
    process.exit(1);
  }
}
