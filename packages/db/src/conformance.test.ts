import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { loadSpecSchema } from './testing/spec-schema.js';
import { startTestDatabase, type TestDatabase } from './testing/postgres.js';

/**
 * Les migrations doivent produire, table par table, le schéma cible docs/specs/schema.sql (packages/db/CLAUDE.md).
 * Chaque table créée par les migrations est comparée à son homologue du schéma cible. Seules différences admises :
 * les clés étrangères vers une table d'un lot ultérieur (toutes les autres doivent être posées : les clés composites
 * portent une part de l'isolation), et les politiques qui lisent une table d'un lot ultérieur (ex.
 * projects.subscriber_enrolled_read lisait enrollments, posée au lot 2.3), posées par la migration du lot qui la crée.
 * Une politique permissive absente ne fait que restreindre l'accès.
 */

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Description comparable d'une table : tout ce qui en fait la sécurité et l'intégrité. */
const DESCRIBE_TABLE = `
  SELECT
    (SELECT json_agg(json_build_object('name', a.attname, 'type', format_type(a.atttypid, a.atttypmod),
                                       'notNull', a.attnotnull, 'default', pg_get_expr(d.adbin, d.adrelid))
                     ORDER BY a.attname)
       FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns,
    (SELECT coalesce(json_agg(json_build_object('name', k.conname, 'def', pg_get_constraintdef(k.oid))
                              ORDER BY k.conname), '[]')
       FROM pg_constraint k
      WHERE k.conrelid = c.oid AND k.contype <> 'f') AS constraints,
    (SELECT coalesce(json_agg(json_build_object('name', k.conname, 'def', pg_get_constraintdef(k.oid))
                              ORDER BY k.conname), '[]')
       FROM pg_constraint k
      WHERE k.conrelid = c.oid AND k.contype = 'f') AS foreign_keys,
    (SELECT coalesce(json_agg(i.indexdef ORDER BY i.indexname), '[]')
       FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = c.relname) AS indexes,
    c.relrowsecurity AS rls,
    c.relforcerowsecurity AS forced,
    (SELECT coalesce(json_agg(json_build_object('name', p.policyname, 'permissive', p.permissive, 'roles', p.roles,
                                                'cmd', p.cmd, 'qual', p.qual, 'withCheck', p.with_check)
                              ORDER BY p.policyname), '[]')
       FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
    (SELECT coalesce(json_agg(pg_get_triggerdef(t.oid) ORDER BY t.tgname), '[]')
       FROM pg_trigger t WHERE t.tgrelid = c.oid AND NOT t.tgisinternal) AS triggers,
    (SELECT coalesce(json_agg(g.grantee || ':' || g.privilege_type ORDER BY g.grantee, g.privilege_type), '[]')
       FROM information_schema.role_table_grants g
      WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee LIKE 'cotiz\\_%') AS grants,
    obj_description(c.oid, 'pg_class') AS comment
  FROM pg_class c
  WHERE c.oid = to_regclass('public.' || $1)`;

interface Policy {
  name: string;
  permissive: string;
  qual: string | null;
  withCheck: string | null;
}

interface TableDescription {
  foreign_keys: { name: string; def: string }[];
  policies: Policy[];
  [key: string]: unknown;
}

/** Tables lues par une politique (sous-requêtes `FROM <table>`). */
function tablesReadBy(policy: Policy): string[] {
  return [...`${policy.qual ?? ''} ${policy.withCheck ?? ''}`.matchAll(/\bFROM (\w+)/g)].map((m) => m[1] ?? '');
}

/**
 * Politique cible reportée au lot d'une table qu'elle lit : permissive seulement (son absence restreint l'accès ; celle
 * d'une politique restrictive l'élargirait).
 */
function isDeferred(policy: Policy, migrated: ReadonlySet<string>): boolean {
  return policy.permissive === 'PERMISSIVE' && tablesReadBy(policy).some((t) => !migrated.has(t));
}

async function describeTable(url: string, table: string): Promise<TableDescription | undefined> {
  return withClient(url, async (c) => (await c.query<TableDescription>(DESCRIBE_TABLE, [table])).rows[0]);
}

async function migratedTables(url: string): Promise<string[]> {
  return withClient(url, async (c) => {
    const { rows } = await c.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename",
    );
    return rows.map((r) => r.tablename);
  });
}

/** Fonctions du schéma public : définition complète (corps, langage, volatilité). */
async function functions(url: string): Promise<Map<string, string>> {
  return withClient(url, async (c) => {
    const { rows } = await c.query<{ name: string; def: string }>(
      `SELECT p.oid::regprocedure::text AS name, pg_get_functiondef(p.oid) AS def
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.prokind = 'f'
          AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')`,
    );
    return new Map(rows.map((r) => [r.name, r.def]));
  });
}

/** Types enum du schéma public et leurs valeurs, dans l'ordre. */
async function enums(url: string): Promise<Map<string, string[]>> {
  return withClient(url, async (c) => {
    const { rows } = await c.query<{ name: string; labels: string[] }>(
      `SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder)::text[] AS labels
         FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' GROUP BY t.typname`,
    );
    return new Map(rows.map((r) => [r.name, r.labels]));
  });
}

/** Séquences du schéma public créées explicitement (hors colonnes identity et serial). */
async function sequences(url: string): Promise<string[]> {
  return withClient(url, async (c) => {
    const { rows } = await c.query<{ name: string }>(
      `SELECT s.relname AS name FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace
        WHERE n.nspname = 'public' AND s.relkind = 'S'
          AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.objid = s.oid AND d.deptype IN ('a', 'i'))
        ORDER BY 1`,
    );
    return rows.map((r) => r.name);
  });
}

describe('conformité des migrations au schéma cible (docs/specs/schema.sql)', () => {
  let db: TestDatabase;
  let migrated: string;
  let spec: string;
  let tables: string[];

  beforeAll(async () => {
    db = await startTestDatabase();
    migrated = db.urlFor('cotiz_migrator');
    await runMigrations(migrated);
    await withClient(db.superuserUrl, (c) => c.query('CREATE DATABASE spec OWNER cotiz_migrator'));
    spec = db.urlFor('cotiz_migrator', 'spec');
    await loadSpecSchema(spec);
    tables = await migratedTables(migrated);
  });

  afterAll(async () => {
    await db.container.stop();
  });

  it('chaque table migrée existe dans le schéma cible', async () => {
    const target = new Set(await migratedTables(spec));
    expect(tables.filter((t) => !target.has(t))).toEqual([]);
  });

  it('chaque table migrée est identique à sa définition cible (hors clés étrangères et politiques d’un lot ultérieur)', async () => {
    const present = new Set(tables);
    for (const table of tables) {
      const [actual, expected] = await Promise.all([describeTable(migrated, table), describeTable(spec, table)]);
      const policies = expected?.policies.filter((p) => !isDeferred(p, present));
      expect({ table, ...actual, foreign_keys: undefined }).toEqual({
        table,
        ...expected,
        policies,
        foreign_keys: undefined,
      });
    }
  });

  it('politiques reportées : exactement celles attendues, chacune à poser par le lot qui crée la table lue', async () => {
    const present = new Set(tables);
    const deferred: string[] = [];
    for (const table of tables) {
      const expected = await describeTable(spec, table);
      for (const p of expected?.policies ?? []) if (isDeferred(p, present)) deferred.push(`${table}.${p.name}`);
    }
    // Liste complète, à mettre à jour à chaque lot. Lot 2.3 : les lectures souscripteur des projets (reportées au
    // lot 2.2) sont posées avec enrollments ; aucune politique en attente.
    expect(deferred.sort()).toEqual([]);
  });

  it('les clés étrangères migrées existent toutes dans le schéma cible', async () => {
    for (const table of tables) {
      const [actual, expected] = await Promise.all([describeTable(migrated, table), describeTable(spec, table)]);
      const target = new Set(expected?.foreign_keys.map((k) => k.def));
      expect({ table, extra: actual?.foreign_keys.filter((k) => !target.has(k.def)) }).toEqual({ table, extra: [] });
    }
  });

  it('les clés étrangères cibles entre tables migrées sont toutes posées (dont les clés composites d’isolation)', async () => {
    const present = new Set(tables);
    for (const table of tables) {
      const [actual, expected] = await Promise.all([describeTable(migrated, table), describeTable(spec, table)]);
      const posed = new Set(actual?.foreign_keys.map((k) => k.def));
      // Seule exception admise : une clé vers une table d'un lot ultérieur (posée par la migration qui la crée).
      const due = expected?.foreign_keys.filter((k) => present.has(/REFERENCES (\w+)\(/.exec(k.def)?.[1] ?? ''));
      expect({ table, missing: due?.filter((k) => !posed.has(k.def)) }).toEqual({ table, missing: [] });
    }
  });

  it('chaque type enum migré a les valeurs de sa définition cible, dans le même ordre', async () => {
    const [actual, expected] = await Promise.all([enums(migrated), enums(spec)]);
    for (const [name, labels] of actual) expect({ name, labels }).toEqual({ name, labels: expected.get(name) });
  });

  it('chaque séquence migrée existe dans le schéma cible', async () => {
    const [actual, expected] = await Promise.all([sequences(migrated), sequences(spec)]);
    expect(actual.length).toBeGreaterThan(0);
    expect(actual.filter((name) => !expected.includes(name))).toEqual([]);
  });

  it('chaque fonction migrée est identique à sa définition cible', async () => {
    const [actual, expected] = await Promise.all([functions(migrated), functions(spec)]);
    for (const [name, def] of actual) expect({ name, def }).toEqual({ name, def: expected.get(name) });
  });
});
