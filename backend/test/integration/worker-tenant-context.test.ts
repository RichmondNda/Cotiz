import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runMigrations } from '@cotiz/db/migrate';
import { startTestDatabase, type TestDatabase } from '@cotiz/db/testing';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { currentTx, TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { WorkerModule } from '../../src/worker.module.js';

const A = '00000000-0000-7000-8000-00000000a001';
const B = '00000000-0000-7000-8000-00000000a002';

async function readProbe() {
  const tx = currentTx();
  const labels = await tx.execute<{ label: string }>(sql`SELECT label FROM task_probe ORDER BY label`);
  const ctx = await tx.execute<{ aid: string | null; space: string }>(
    sql`SELECT app_association_id() AS aid, app_space() AS space`,
  );
  return { labels: labels.rows.map((r) => r.label), ctx: ctx.rows[0] };
}

describe('shared/tenant-context (worker) : withTenantContext()', () => {
  let db: TestDatabase;
  let worker: INestApplicationContext;
  let tenantDb: TenantDatabase;

  beforeAll(async () => {
    db = await startTestDatabase();
    await runMigrations(db.urlFor('cotiz_migrator'));
    const client = new pg.Client({ connectionString: db.urlFor('cotiz_migrator') });
    await client.connect();
    // Même forme que les tables de schema.sql balayées par le worker : tenant_isolation + system_access.
    await client.query(
      `CREATE TABLE task_probe (id serial PRIMARY KEY, association_id uuid NOT NULL, label text NOT NULL);
       ALTER TABLE task_probe ENABLE ROW LEVEL SECURITY;
       ALTER TABLE task_probe FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON task_probe
         USING (association_id = app_association_id()) WITH CHECK (association_id = app_association_id());
       CREATE POLICY system_access ON task_probe
         USING (app_space() = 'system') WITH CHECK (app_space() = 'system');`,
    );
    await client.end();
    const seed = new pg.Client({ connectionString: db.superuserUrl });
    await seed.connect();
    await seed.query(
      `INSERT INTO task_probe (association_id, label) VALUES ('${A}', 'a1'), ('${A}', 'a2'), ('${B}', 'b1')`,
    );
    await seed.end();

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: db.urlFor('cotiz_app'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
    });
    worker = await NestFactory.createApplicationContext(WorkerModule.register(config), { logger: false });
    tenantDb = worker.get(TenantDatabase);
  });

  afterAll(async () => {
    await worker.close();
    await db.container.stop();
  });

  it('une tâche system balaie toutes les associations', async () => {
    const result = await tenantDb.withTenantContext({ space: 'system' }, readProbe);
    expect(result).toEqual({ labels: ['a1', 'a2', 'b1'], ctx: { aid: null, space: 'system' } });
  });

  it('une tâche d’une association ne voit que ses lignes', async () => {
    const result = await tenantDb.withTenantContext({ space: 'association', associationId: B }, readProbe);
    expect(result).toEqual({ labels: ['b1'], ctx: { aid: B, space: 'association' } });
  });

  it('en espace system, associationId est indicatif : la tâche voit toutes les associations', async () => {
    const result = await tenantDb.withTenantContext({ space: 'system', associationId: A }, readProbe);
    expect(result).toEqual({ labels: ['a1', 'a2', 'b1'], ctx: { aid: A, space: 'system' } });
  });

  it('une tâche d’une association ne peut pas écrire chez une autre', async () => {
    await expect(
      tenantDb.withTenantContext({ space: 'association', associationId: A }, () =>
        currentTx().execute(sql`INSERT INTO task_probe (association_id, label) VALUES (${B}, 'intrus')`),
      ),
    ).rejects.toThrow();
    const result = await tenantDb.withTenantContext({ space: 'system' }, readProbe);
    expect(result.labels).not.toContain('intrus');
  });

  it('une tâche qui échoue annule ses écritures', async () => {
    await expect(
      tenantDb.withTenantContext({ space: 'association', associationId: A }, async () => {
        await currentTx().execute(sql`INSERT INTO task_probe (association_id, label) VALUES (${A}, 'fantome')`);
        throw new Error('échec de la tâche');
      }),
    ).rejects.toThrow('échec de la tâche');
    const result = await tenantDb.withTenantContext({ space: 'system' }, readProbe);
    expect(result.labels).not.toContain('fantome');
  });

  it('refuse un contexte imbriqué, même system dans une tâche d’association', async () => {
    await expect(
      tenantDb.withTenantContext({ space: 'association', associationId: A }, () =>
        tenantDb.withTenantContext({ space: 'system' }, readProbe),
      ),
    ).rejects.toThrow(/imbriqué/);
  });
});
