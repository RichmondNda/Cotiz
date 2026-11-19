import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des tables du lot 4.4 (base migrée) : import_jobs et import_rows ne se lisent et ne s'écrivent que dans le
 * contexte de leur association (tenant_isolation, forcée) ; aucun accès souscripteur, public ou sans contexte. Chaque
 * politique est aussi testée affaiblie.
 */

const F = { a: '00000000-0000-7000-8000-0000000e0a01', b: '00000000-0000-7000-8000-0000000e0b01' } as const;
const J = { a: '00000000-0000-7000-8000-0000000e1a01', b: '00000000-0000-7000-8000-0000000e1b01' } as const;
const R = { a: '00000000-0000-7000-8000-0000000e2a01', b: '00000000-0000-7000-8000-0000000e2b01' } as const;
const PROJECT = '00000000-0000-7000-8000-0000000e3001';

const ids = (table: 'import_jobs' | 'import_rows') => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));

const insertJob = (tx: Tx, id: string, associationId: string, fileId: string) =>
  tx.execute(sql`INSERT INTO import_jobs (id, association_id, project_id, source_file_id, column_mapping,
                                          invite_channels, created_by)
                 VALUES (${id}, ${associationId}, ${PROJECT}, ${fileId}, '[]', '{}', ${USERS.awa})`);

const insertRow = (tx: Tx, id: string, jobId: string, associationId: string) =>
  tx.execute(sql`INSERT INTO import_rows (id, import_job_id, association_id, row_number, raw, category)
                 VALUES (${id}, ${jobId}, ${associationId}, 99, '{}', 'ready')`);

describe('isolation : imports (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                          size_bytes)
       VALUES ($1, $3, $5, 'import_source', 'cotiz-imports', 'a/import_source/a.csv', 'a.csv', 'text/csv', 1),
              ($2, $4, $6, 'import_source', 'cotiz-imports', 'b/import_source/b.csv', 'b.csv', 'text/csv', 1)`,
      [F.a, F.b, A.id, B.id, USERS.awa, USERS.awa],
    );
    await h.superuser(
      `INSERT INTO import_jobs (id, association_id, project_id, source_file_id, column_mapping, invite_channels,
                                created_by)
       VALUES ($1, $3, $5, $6, '[]', '{}', $8), ($2, $4, $5, $7, '[]', '{}', $8)`,
      [J.a, J.b, A.id, B.id, PROJECT, F.a, F.b, USERS.awa],
    );
    await h.superuser(
      `INSERT INTO import_rows (id, import_job_id, association_id, row_number, raw, category)
       VALUES ($1, $3, $5, 1, '{"Tel":"0700000000"}', 'ready'), ($2, $4, $6, 1, '{"Tel":"0700000001"}', 'ready')`,
      [R.a, R.b, J.a, J.b, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  it('chaque association ne voit que ses imports et leurs lignes', async () => {
    expect(await h.as(asManagerOf(A), ids('import_jobs'))).toEqual([J.a]);
    expect(await h.as(asManagerOf(A), ids('import_rows'))).toEqual([R.a]);
    expect(await h.as(asManagerOf(B), ids('import_jobs'))).toEqual([J.b]);
    expect(await h.as(asManagerOf(B), ids('import_rows'))).toEqual([R.b]);
  });

  it('souscripteur, espace public, sans contexte : rien', async () => {
    for (const table of ['import_jobs', 'import_rows']) {
      expect(await h.countWithoutTenantDatabase(table)).toBe(0);
      expect(await h.count(null, table)).toBe(0);
      expect(await h.count({ space: 'public' }, table)).toBe(0);
      expect(await h.as(asSubscriber(USERS.moussa), ids(table as 'import_jobs'))).toEqual([]);
    }
  });

  it('A ne crée ni import ni ligne au nom de B', async () => {
    const job = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => insertJob(tx, '00000000-0000-7000-8000-0000000e1c01', B.id, F.b)),
    );
    expect(isRlsViolation(job)).toBe(true);
    const row = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => insertRow(tx, '00000000-0000-7000-8000-0000000e2c01', J.b, B.id)),
    );
    expect(isRlsViolation(row)).toBe(true);
  });

  it('A ne modifie ni ne supprime les lignes de B ; les siennes, oui', async () => {
    const other = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE import_rows SET category = 'ignored' WHERE id = ${R.b}`),
    );
    expect(other.rowCount).toBe(0);
    const removed = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`DELETE FROM import_jobs WHERE id = ${J.b}`),
    );
    expect(removed.rowCount).toBe(0);
    const own = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE import_rows SET category = 'ignored' WHERE id = ${R.a}`),
    );
    expect(own.rowCount).toBe(1);
  });

  it('A ne déplace pas sa ligne dans B (WITH CHECK)', async () => {
    const moved = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE import_rows SET association_id = ${B.id} WHERE id = ${R.a}`),
      ),
    );
    expect(isRlsViolation(moved)).toBe(true);
  });

  describe('politiques affaiblies : le test échoue', () => {
    for (const table of ['import_jobs', 'import_rows'] as const) {
      it(`tenant_isolation de ${table} ouverte : A lit la ligne de B`, async () => {
        const leaked = await h.withPolicy(table, 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
          h.as(asManagerOf(A), ids(table)),
        );
        expect(leaked).toEqual(table === 'import_jobs' ? [J.a, J.b] : [R.a, R.b]);
      });
    }
  });
});
