import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { startTestDatabase, type TestDatabase } from './testing/postgres.js';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));
const JOURNAL = JSON.parse(readFileSync(new URL('../migrations/meta/_journal.json', import.meta.url), 'utf8')) as {
  entries: unknown[];
};

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function rows<T>(url: string, sql: string): Promise<T[]> {
  return withClient(url, async (client) => (await client.query(sql)).rows as T[]);
}

/** Message de l'erreur PostgreSQL, que Drizzle enveloppe dans `cause`. */
function pgMessage(error: unknown): string {
  let current = error;
  while (current instanceof Error && current.cause instanceof Error) current = current.cause;
  return current instanceof Error ? current.message : String(current);
}

/** Une migration refusée ne laisse rien : ni extension, ni fonction, ni entrée au journal. */
async function expectNothingApplied(superuserUrl: string): Promise<void> {
  await withClient(superuserUrl, async (c) => {
    const state = await c.query<{ fn: boolean; ext: string; journal: boolean }>(
      `SELECT to_regprocedure('app_space()') IS NOT NULL AS fn,
              (SELECT count(*) FROM pg_extension WHERE extname IN ('citext', 'pg_trgm')) AS ext,
              to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS journal`,
    );
    expect(state.rows[0]).toMatchObject({ fn: false, ext: '0' });
    if (state.rows[0]?.journal) {
      const applied = await c.query<{ n: string }>('SELECT count(*) AS n FROM drizzle.__drizzle_migrations');
      expect(applied.rows[0]?.n).toBe('0');
    }
  });
}

const run = promisify(execFile);

describe('migrations (base vide)', () => {
  let db: TestDatabase;
  let mutable: TestDatabase;
  let withoutRoles: TestDatabase;

  beforeAll(async () => {
    [db, mutable, withoutRoles] = await Promise.all([
      startTestDatabase(),
      startTestDatabase(),
      startTestDatabase({ withRoles: false }),
    ]);
    await runMigrations(db.urlFor('cotiz_migrator'));
  });

  afterAll(async () => {
    await Promise.all([db.container.stop(), mutable.container.stop(), withoutRoles.container.stop()]);
  });

  it('installe citext et pg_trgm', async () => {
    const installed = await rows<{ extname: string }>(
      db.superuserUrl,
      "SELECT extname FROM pg_extension WHERE extname IN ('citext', 'pg_trgm') ORDER BY extname",
    );
    expect(installed.map((r) => r.extname)).toEqual(['citext', 'pg_trgm']);
  });

  it('est rejouable : une seconde exécution n’applique rien', async () => {
    await runMigrations(db.urlFor('cotiz_migrator'));
    const [applied] = await rows<{ n: string }>(
      db.superuserUrl,
      'SELECT count(*) AS n FROM drizzle.__drizzle_migrations',
    );
    expect(Number(applied?.n)).toBe(JOURNAL.entries.length);
  });

  it('seul cotiz_platform contourne la RLS ; aucun rôle n’est superutilisateur ni ne réplique', async () => {
    const roles = await rows<Record<string, unknown>>(
      db.superuserUrl,
      `SELECT rolname, rolbypassrls, rolsuper, rolreplication, rolcreatedb, rolcreaterole
         FROM pg_roles WHERE rolname LIKE 'cotiz\\_%' ORDER BY rolname`,
    );
    const attributes = { rolsuper: false, rolreplication: false, rolcreatedb: false, rolcreaterole: false };
    expect(roles).toEqual([
      { rolname: 'cotiz_app', rolbypassrls: false, ...attributes },
      { rolname: 'cotiz_migrator', rolbypassrls: false, ...attributes },
      { rolname: 'cotiz_platform', rolbypassrls: true, ...attributes },
      { rolname: 'cotiz_readonly', rolbypassrls: false, ...attributes },
    ]);
  });

  it('sans contexte, les fonctions de contexte renvoient NULL et l’espace « none »', async () => {
    const [ctx] = await rows<{ aid: string | null; uid: string | null; space: string }>(
      db.urlFor('cotiz_app'),
      'SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space',
    );
    expect(ctx).toEqual({ aid: null, uid: null, space: 'none' });
  });

  it('le contexte posé dans une transaction meurt avec elle', async () => {
    await withClient(db.urlFor('cotiz_app'), async (client) => {
      const aid = '00000000-0000-7000-8000-00000000a001';
      const uid = '00000000-0000-7000-8000-000000000001';
      await client.query('BEGIN');
      await client.query(
        "SELECT set_config('app.association_id', $1, true), set_config('app.user_id', $2, true), set_config('app.space', 'association', true)",
        [aid, uid],
      );
      const inside = await client.query(
        'SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space',
      );
      expect(inside.rows[0]).toEqual({ aid, uid, space: 'association' });
      await client.query('COMMIT');
      const after = await client.query(
        'SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space',
      );
      expect(after.rows[0]).toEqual({ aid: null, uid: null, space: 'none' });
    });
  });

  it('l’usage du schéma public est accordé aux rôles Cotiz seulement', async () => {
    await withClient(db.superuserUrl, (c) => c.query('CREATE ROLE tiers'));
    const [usage] = await rows<Record<string, boolean>>(
      db.superuserUrl,
      `SELECT has_schema_privilege('cotiz_app', 'public', 'USAGE') AS app,
              has_schema_privilege('cotiz_platform', 'public', 'USAGE') AS platform,
              has_schema_privilege('cotiz_readonly', 'public', 'USAGE') AS readonly,
              has_schema_privilege('tiers', 'public', 'USAGE') AS tiers`,
    );
    expect(usage).toEqual({ app: true, platform: true, readonly: true, tiers: false });
  });

  it('les tables et séquences créées ensuite par cotiz_migrator reçoivent les droits par défaut', async () => {
    await withClient(db.urlFor('cotiz_migrator'), (c) =>
      c.query('CREATE TABLE droits_test (id serial PRIMARY KEY, v int)'),
    );
    try {
      for (const role of ['cotiz_app', 'cotiz_platform'] as const) {
        await withClient(db.urlFor(role), async (c) => {
          const inserted = await c.query<{ id: number }>('INSERT INTO droits_test (v) VALUES (1) RETURNING id');
          const id = inserted.rows[0]?.id;
          expect((await c.query('SELECT v FROM droits_test WHERE id = $1', [id])).rows).toEqual([{ v: 1 }]);
          expect((await c.query('UPDATE droits_test SET v = 2 WHERE id = $1', [id])).rowCount).toBe(1);
          expect((await c.query('DELETE FROM droits_test WHERE id = $1', [id])).rowCount).toBe(1);
        });
      }
      await withClient(db.urlFor('cotiz_readonly'), async (c) => {
        await c.query('SELECT * FROM droits_test');
        await expect(c.query('INSERT INTO droits_test (v) VALUES (1)')).rejects.toThrow(/permission denied/);
      });
    } finally {
      await withClient(db.urlFor('cotiz_migrator'), (c) => c.query('DROP TABLE droits_test'));
    }
  });

  it('cotiz_app ne peut créer ni table ni table temporaire', async () => {
    await withClient(db.urlFor('cotiz_app'), async (c) => {
      await expect(c.query('CREATE TABLE intrus (id int)')).rejects.toThrow(/permission denied/);
      await expect(c.query('CREATE TEMP TABLE intrus (id int)')).rejects.toThrow(/permission denied/);
    });
  });

  it('refuse de s’exécuter avec un autre rôle que cotiz_migrator', async () => {
    // Base à part : le superutilisateur y crée le schéma « drizzle », qui gênerait les autres tests.
    await withClient(mutable.superuserUrl, (c) => c.query('CREATE DATABASE autre OWNER cotiz_migrator'));
    const url = new URL(mutable.superuserUrl);
    url.pathname = '/autre';
    const error = await runMigrations(url.toString()).catch((e: unknown) => e);
    expect(pgMessage(error)).toMatch(/s'exécutent en cotiz_migrator/);
    await expectNothingApplied(url.toString());
  });

  it.each([
    [
      'cotiz_app BYPASSRLS',
      'ALTER ROLE cotiz_app BYPASSRLS',
      'ALTER ROLE cotiz_app NOBYPASSRLS',
      /cotiz_app ne doit avoir ni BYPASSRLS/,
    ],
    [
      'cotiz_app SUPERUSER',
      'ALTER ROLE cotiz_app SUPERUSER',
      'ALTER ROLE cotiz_app NOSUPERUSER',
      /cotiz_app ne doit avoir ni BYPASSRLS/,
    ],
    [
      'cotiz_readonly REPLICATION',
      'ALTER ROLE cotiz_readonly REPLICATION',
      'ALTER ROLE cotiz_readonly NOREPLICATION',
      /cotiz_readonly ne doit avoir ni BYPASSRLS/,
    ],
    [
      'cotiz_app membre de cotiz_platform',
      'GRANT cotiz_platform TO cotiz_app',
      'REVOKE cotiz_platform FROM cotiz_app',
      /cotiz_app ne doit être membre d'aucun rôle/,
    ],
    [
      'cotiz_readonly membre de cotiz_migrator',
      'GRANT cotiz_migrator TO cotiz_readonly',
      'REVOKE cotiz_migrator FROM cotiz_readonly',
      /cotiz_readonly ne doit être membre d'aucun rôle/,
    ],
  ])('refuse un rôle dangereux (%s) et n’applique rien', async (_name, grant, revoke, message) => {
    await withClient(mutable.superuserUrl, (c) => c.query(grant));
    try {
      const error = await runMigrations(mutable.urlFor('cotiz_migrator')).catch((e: unknown) => e);
      expect(pgMessage(error)).toMatch(message);
      await expectNothingApplied(mutable.superuserUrl);
    } finally {
      await withClient(mutable.superuserUrl, (c) => c.query(revoke));
    }
  });

  it('échoue clairement si les rôles n’ont pas été créés, sans rien appliquer', async () => {
    const error = await runMigrations(withoutRoles.superuserUrl).catch((e: unknown) => e);
    expect(pgMessage(error)).toMatch(/rôle cotiz_migrator absent/);
    await expectNothingApplied(withoutRoles.superuserUrl);
  });

  describe('commande pnpm db:migrate', () => {
    it('applique les migrations à partir de MIGRATION_DATABASE_URL', async () => {
      await withClient(db.superuserUrl, (c) => c.query('CREATE DATABASE cli OWNER cotiz_migrator'));
      const { stdout } = await run('pnpm', ['run', '--silent', 'migrate'], {
        cwd: PACKAGE_DIR,
        env: { ...process.env, MIGRATION_DATABASE_URL: db.urlFor('cotiz_migrator', 'cli') },
      });
      expect(stdout).toContain('Migrations appliquées.');
      const [fn] = await rows<{ ok: boolean }>(
        db.urlFor('cotiz_app', 'cli'),
        "SELECT to_regprocedure('app_space()') IS NOT NULL AS ok",
      );
      expect(fn?.ok).toBe(true);
    });

    it('sort en erreur sans jamais afficher l’URL ni le mot de passe', async () => {
      const url = new URL(db.urlFor('cotiz_migrator'));
      url.password = 'mauvais-secret-42';
      const error = (await run('pnpm', ['run', '--silent', 'migrate'], {
        cwd: PACKAGE_DIR,
        env: { ...process.env, MIGRATION_DATABASE_URL: url.toString() },
      }).catch((e: unknown) => e)) as { code: number; stdout: string; stderr: string };
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('Échec des migrations');
      expect(`${error.stdout}${error.stderr}`).not.toContain('mauvais-secret-42');
      expect(`${error.stdout}${error.stderr}`).not.toContain(url.host);
    });

    it('sort en erreur si MIGRATION_DATABASE_URL manque', async () => {
      const env = { ...process.env };
      delete env.MIGRATION_DATABASE_URL;
      const error = (await run(process.execPath, ['src/migrate.ts'], { cwd: PACKAGE_DIR, env }).catch(
        (e: unknown) => e,
      )) as { code: number; stderr: string };
      expect(error.code).toBe(1);
      expect(error.stderr).toContain('MIGRATION_DATABASE_URL : manquante');
    });
  });
});
