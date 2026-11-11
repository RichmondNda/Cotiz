import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { auditTenantSecurity, enableTenantRls } from './rls.js';
import { loadSpecSchema } from './testing/spec-schema.js';
import { startTestDatabase, type TestDatabase } from './testing/postgres.js';

async function withClient<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe('enableTenantRls()', () => {
  it('produit ENABLE, FORCE et tenant_isolation, comme docs/specs/schema.sql', () => {
    expect(enableTenantRls('projects')).toBe(
      [
        'ALTER TABLE projects ENABLE ROW LEVEL SECURITY;',
        'ALTER TABLE projects FORCE ROW LEVEL SECURITY;',
        'CREATE POLICY tenant_isolation ON projects',
        '  USING (association_id = app_association_id())',
        '  WITH CHECK (association_id = app_association_id());',
      ].join('\n'),
    );
  });

  it.each(['Projects', 'projects; DROP TABLE users', '1projects', '', 'a'.repeat(64)])(
    'refuse un nom de table invalide (%j)',
    (name) => {
      expect(() => enableTenantRls(name)).toThrow(/nom de table/);
    },
  );
});

describe('garde-fou RLS et droits (auditTenantSecurity)', () => {
  let db: TestDatabase;
  let scratchUrl: string;

  /** Crée une table dans la base de travail (migrée), audite, puis la supprime. */
  async function auditWith(ddl: string) {
    return withClient(scratchUrl, async (c) => {
      await c.query(ddl);
      try {
        return await auditTenantSecurity(c);
      } finally {
        await c.query(
          `DROP TABLE IF EXISTS widgets, plans_test, payments, allocations, installments, invoices, audit_logs,
             contract_signatures CASCADE; DROP SCHEMA IF EXISTS tenant CASCADE;`,
        );
      }
    });
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    await runMigrations(db.urlFor('cotiz_migrator'));
    await withClient(db.superuserUrl, async (c) => {
      await c.query('CREATE DATABASE spec OWNER cotiz_migrator');
      await c.query('CREATE DATABASE scratch OWNER cotiz_migrator');
    });
    await loadSpecSchema(db.urlFor('cotiz_migrator', 'spec'));
    scratchUrl = db.urlFor('cotiz_migrator', 'scratch');
    await runMigrations(scratchUrl);
    // Base de travail : fonctions et droits par défaut des migrations, sans leurs tables (les cas ci-dessous créent
    // leurs propres audit_logs, payments… jetables).
    await withClient(scratchUrl, (c) =>
      c.query(`DO $$ DECLARE t text; BEGIN
                 FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
                   EXECUTE format('DROP TABLE %I CASCADE', t);
                 END LOOP;
               END $$`),
    );
  });

  afterAll(async () => {
    await db.container.stop();
  });

  it('la base migrée est conforme (test méta exécuté en CI)', async () => {
    expect(await withClient(db.urlFor('cotiz_migrator'), auditTenantSecurity)).toEqual([]);
  });

  it('le schéma cible docs/specs/schema.sql est conforme', async () => {
    expect(await withClient(db.urlFor('cotiz_migrator', 'spec'), auditTenantSecurity)).toEqual([]);
  });

  it('une table tenant créée avec enableTenantRls() est conforme', async () => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);\n${enableTenantRls('widgets')}`,
    );
    expect(problems).toEqual([]);
  });

  it('une table tenant sans politique fait échouer le garde-fou', async () => {
    const problems = await auditWith('CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL)');
    expect(problems).toEqual([
      { table: 'widgets', problem: 'rls_disabled' },
      { table: 'widgets', problem: 'rls_not_forced' },
      { table: 'widgets', problem: 'missing_tenant_isolation' },
    ]);
  });

  it('RLS activée mais pas forcée : signalé (le propriétaire contournerait les politiques)', async () => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);
       ${enableTenantRls('widgets').replace('ALTER TABLE widgets FORCE ROW LEVEL SECURITY;', '')}`,
    );
    expect(problems).toEqual([{ table: 'widgets', problem: 'rls_not_forced' }]);
  });

  it('une politique tenant_isolation modifiée est signalée', async () => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);
       ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
       ALTER TABLE widgets FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON widgets USING (true) WITH CHECK (association_id = app_association_id());`,
    );
    expect(problems).toEqual([
      { table: 'widgets', problem: 'tenant_isolation_altered' },
      { table: 'widgets', problem: 'policy_without_context:tenant_isolation' },
    ]);
  });

  it('une politique tenant_isolation restreinte à SELECT est signalée (écritures sans WITH CHECK)', async () => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);
       ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
       ALTER TABLE widgets FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON widgets FOR SELECT USING (association_id = app_association_id());`,
    );
    expect(problems).toEqual([{ table: 'widgets', problem: 'tenant_isolation_altered' }]);
  });

  it('association_id nullable sans RLS : signalé (tables personnelles, outbox, audit)', async () => {
    const problems = await auditWith('CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid)');
    expect(problems).toEqual([
      { table: 'widgets', problem: 'rls_disabled' },
      { table: 'widgets', problem: 'rls_not_forced' },
    ]);
  });

  it('une table sans association_id n’est pas concernée par la RLS', async () => {
    expect(await auditWith('CREATE TABLE plans_test (id uuid PRIMARY KEY)')).toEqual([]);
  });

  it.each(['payments', 'allocations', 'installments', 'invoices'])(
    'DELETE sur la table d’argent %s laissé à cotiz_app ou cotiz_platform : signalé',
    async (table) => {
      const ddl = `CREATE TABLE ${table} (id uuid PRIMARY KEY, association_id uuid NOT NULL);\n${enableTenantRls(table)}`;
      expect(await auditWith(ddl)).toEqual([
        { table, problem: 'cotiz_app:DELETE' },
        { table, problem: 'cotiz_platform:DELETE' },
      ]);
      expect(await auditWith(`${ddl}\nREVOKE DELETE ON ${table} FROM cotiz_app, cotiz_platform;`)).toEqual([]);
    },
  );

  it.each(['audit_logs', 'contract_signatures'])('UPDATE ou DELETE sur %s (ajout seul) : signalé', async (table) => {
    const ddl = `CREATE TABLE ${table} (id bigint PRIMARY KEY, payload text)`;
    expect(await auditWith(ddl)).toEqual([
      { table, problem: 'cotiz_app:UPDATE' },
      { table, problem: 'cotiz_app:DELETE' },
      { table, problem: 'cotiz_platform:UPDATE' },
      { table, problem: 'cotiz_platform:DELETE' },
    ]);
    const revoked = `${ddl};\nREVOKE UPDATE, DELETE ON ${table} FROM cotiz_app, cotiz_platform;`;
    expect(await auditWith(revoked)).toEqual([]);
    // Un droit accordé sur une seule colonne suffit à modifier le journal.
    expect(await auditWith(`${revoked}\nGRANT UPDATE (payload) ON ${table} TO cotiz_app;`)).toEqual([
      { table, problem: 'cotiz_app:UPDATE' },
    ]);
  });

  it('TRUNCATE (qui ignore la RLS) accordé à un rôle applicatif : signalé', async () => {
    const problems = await auditWith(
      `CREATE TABLE plans_test (id uuid PRIMARY KEY);
       GRANT TRUNCATE ON plans_test TO cotiz_app;
       GRANT TRIGGER ON plans_test TO cotiz_platform;
       GRANT INSERT ON plans_test TO cotiz_readonly;`,
    );
    expect(problems).toEqual([
      { table: 'plans_test', problem: 'cotiz_app:TRUNCATE' },
      { table: 'plans_test', problem: 'cotiz_platform:TRIGGER' },
      { table: 'plans_test', problem: 'cotiz_readonly:INSERT' },
    ]);
  });

  it('cotiz_readonly ne peut ni modifier, ni supprimer, ni vider', async () => {
    const problems = await auditWith(
      `CREATE TABLE plans_test (id uuid PRIMARY KEY, label text);
       GRANT UPDATE (label), DELETE, TRUNCATE ON plans_test TO cotiz_readonly;`,
    );
    expect(problems).toEqual([
      { table: 'plans_test', problem: 'cotiz_readonly:UPDATE' },
      { table: 'plans_test', problem: 'cotiz_readonly:DELETE' },
      { table: 'plans_test', problem: 'cotiz_readonly:TRUNCATE' },
    ]);
  });

  const TENANT_TABLE = `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);
     ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
     ALTER TABLE widgets FORCE ROW LEVEL SECURITY;`;
  const TENANT = '(association_id = app_association_id())';

  it.each([
    [
      'WITH CHECK (true) : écriture dans une autre association',
      `FOR ALL USING ${TENANT} WITH CHECK (true)`,
      ['tenant_isolation_altered', 'policy_without_context:tenant_isolation'],
    ],
    ['restreinte à UPDATE', `FOR UPDATE USING ${TENANT} WITH CHECK ${TENANT}`, ['tenant_isolation_altered']],
    ['RESTRICTIVE', `AS RESTRICTIVE USING ${TENANT} WITH CHECK ${TENANT}`, ['tenant_isolation_altered']],
    ['réservée à un rôle', `TO cotiz_readonly USING ${TENANT} WITH CHECK ${TENANT}`, ['tenant_isolation_altered']],
  ])('tenant_isolation altérée (%s) : signalée', async (_name, clause, expected) => {
    const problems = await auditWith(`${TENANT_TABLE}\nCREATE POLICY tenant_isolation ON widgets ${clause};`);
    expect(problems).toEqual(expected.map((problem) => ({ table: 'widgets', problem })));
  });

  it.each(
    ['tenant_manage', 'tenant_templates'].flatMap((policy) => [
      [policy, 'conforme', `USING ${TENANT} WITH CHECK ${TENANT}`, []],
      [
        policy,
        'élargie',
        `USING (${TENANT.slice(1, -1)} OR app_space() <> 'none') WITH CHECK ${TENANT}`,
        ['tenant_manage_altered'],
      ],
      [
        policy,
        'sans WITH CHECK identique',
        `USING ${TENANT} WITH CHECK (app_user_id() IS NOT NULL)`,
        ['tenant_manage_altered'],
      ],
    ]),
  )('%s %s', async (policy, _name, clause, expected) => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid);
       ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
       ALTER TABLE widgets FORCE ROW LEVEL SECURITY;
       CREATE POLICY ${policy} ON widgets ${clause};`,
    );
    expect(problems).toEqual(expected.map((problem) => ({ table: 'widgets', problem })));
  });

  it('une seconde politique permissive sans contexte annule l’isolation : signalée', async () => {
    const problems = await auditWith(`${TENANT_TABLE}\n${enableTenantRls('widgets').split('\n').slice(2).join('\n')}
      CREATE POLICY debug ON widgets FOR SELECT USING (true);`);
    expect(problems).toEqual([{ table: 'widgets', problem: 'policy_without_context:debug' }]);
  });

  it('même chose sur une table à association_id nullable', async () => {
    const problems = await auditWith(
      `CREATE TABLE widgets (id uuid PRIMARY KEY, association_id uuid);
       ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
       ALTER TABLE widgets FORCE ROW LEVEL SECURITY;
       CREATE POLICY debug ON widgets USING (association_id IS NOT NULL);`,
    );
    expect(problems).toEqual([{ table: 'widgets', problem: 'policy_without_context:debug' }]);
  });

  it('une table tenant hors du schéma public est auditée', async () => {
    const problems = await auditWith(
      'CREATE SCHEMA tenant; CREATE TABLE tenant.widgets (id uuid PRIMARY KEY, association_id uuid NOT NULL);',
    );
    expect(problems).toEqual([
      { table: 'tenant.widgets', problem: 'rls_disabled' },
      { table: 'tenant.widgets', problem: 'rls_not_forced' },
      { table: 'tenant.widgets', problem: 'missing_tenant_isolation' },
    ]);
  });

  it('une table qui n’appartient pas à cotiz_migrator : signalée', async () => {
    const url = new URL(db.superuserUrl);
    url.pathname = '/scratch';
    await withClient(url.toString(), (c) => c.query('CREATE TABLE plans_test (id uuid PRIMARY KEY)'));
    try {
      const problems = await withClient(scratchUrl, auditTenantSecurity);
      expect(problems).toEqual([{ table: 'plans_test', problem: `owner:${db.container.getUsername()}` }]);
    } finally {
      await withClient(url.toString(), (c) => c.query('DROP TABLE plans_test'));
    }
  });
});
