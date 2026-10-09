import { setTimeout as sleep } from 'node:timers/promises';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { pgTable, text, uuid } from 'drizzle-orm/pg-core';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createdAt, id, updatedAt, version } from './columns.js';
import { runMigrations } from './migrate.js';
import { enableTenantRls } from './rls.js';
import { startTestDatabase, type TestDatabase } from './testing/postgres.js';
import { updateWithVersion, VersionConflictError } from './versioning.js';

const widgets = pgTable('widgets', {
  id: id(),
  label: text('label').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: version(),
});

/** Table d'association versionnée, avec une lecture souscripteur sans écriture (comme payments, projects). */
const tenantWidgets = pgTable('tenant_widgets', {
  id: id(),
  associationId: uuid('association_id').notNull(),
  userId: uuid('user_id'),
  label: text('label').notNull(),
  updatedAt: updatedAt(),
  version: version(),
});

/** Promesse résolue à la demande (synchronisation des transactions concurrentes). */
function signal() {
  let fire: (() => void) | undefined;
  const promise = new Promise<undefined>((resolve) => {
    fire = () => {
      resolve(undefined);
    };
  });
  return { promise, fire: () => fire?.() };
}

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const A = '00000000-0000-7000-8000-00000000a001';
const B = '00000000-0000-7000-8000-00000000a002';
const MOUSSA = '00000000-0000-7000-8000-000000000002';
const MISSING = '00000000-0000-7000-8000-000000000000';

describe('colonnes communes et verrou optimiste', () => {
  let tdb: TestDatabase;
  let pool: pg.Pool;
  let appPool: pg.Pool;
  let db: NodePgDatabase;
  let app: NodePgDatabase;

  beforeAll(async () => {
    tdb = await startTestDatabase();
    const url = tdb.urlFor('cotiz_migrator');
    await runMigrations(url);
    pool = new pg.Pool({ connectionString: url, max: 4 });
    // Même forme que docs/specs/schema.sql : pas de DEFAULT sur id (PostgreSQL 16 n'a pas uuidv7()).
    await pool.query(`
      CREATE TABLE widgets (
        id uuid PRIMARY KEY,
        label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        version int NOT NULL DEFAULT 1
      );
      CREATE TABLE tenant_widgets (
        id uuid PRIMARY KEY,
        association_id uuid NOT NULL,
        user_id uuid,
        label text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now(),
        version int NOT NULL DEFAULT 1
      );
      ${enableTenantRls('tenant_widgets')}
      CREATE POLICY subscriber_self_read ON tenant_widgets FOR SELECT
        USING (user_id = app_user_id() AND app_space() = 'subscriber');`);
    db = drizzle({ client: pool });
    appPool = new pg.Pool({ connectionString: tdb.urlFor('cotiz_app'), max: 2 });
    app = drizzle({ client: appPool });
  });

  afterAll(async () => {
    await pool.end();
    await appPool.end();
    await tdb.container.stop();
  });

  async function insert(label: string) {
    const [row] = await db.insert(widgets).values({ label }).returning();
    if (!row) throw new Error('insertion sans ligne');
    return row;
  }

  /** updateWithVersion() exige une transaction : celle du contexte tenant, dans l'api. */
  const update = (target: { id: string; version: number }, label: string) =>
    db.transaction((tx) => updateWithVersion(tx, widgets, target, { label }));

  it('id : UUID v7 généré par l’application, croissant ; created_at, updated_at et version par défaut', async () => {
    const first = await insert('a');
    const second = await insert('b');
    expect(first.id).toMatch(UUID_V7);
    expect(second.id > first.id).toBe(true);
    expect(first.version).toBe(1);
    expect(first.createdAt).toBeInstanceOf(Date);
    expect(first.updatedAt.getTime()).toBe(first.createdAt.getTime());
  });

  it('updateWithVersion() : applique, incrémente la version et rafraîchit updated_at', async () => {
    const row = await insert('avant');
    await sleep(5);
    const updated = await update({ id: row.id, version: 1 }, 'après');
    expect(updated).toMatchObject({ id: row.id, label: 'après', version: 2 });
    expect(updated?.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
    expect(updated?.createdAt.getTime()).toBe(row.createdAt.getTime());
  });

  it('version périmée : VersionConflictError (version_conflict), ligne inchangée', async () => {
    const row = await insert('avant');
    await update({ id: row.id, version: 1 }, 'v2');
    const error = await update({ id: row.id, version: 1 }, 'perdu').then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(VersionConflictError);
    expect(error).toMatchObject({ code: 'version_conflict', table: 'widgets' });
    const [current] = await db.select().from(widgets).where(eq(widgets.id, row.id));
    expect(current).toMatchObject({ label: 'v2', version: 2 });
  });

  it('ligne absente : null, pour un 404 et non un 412', async () => {
    expect(await update({ id: MISSING, version: 1 }, 'x')).toBeNull();
  });

  it('la version ne se fixe pas par les valeurs : seul updateWithVersion() l’incrémente', async () => {
    const row = await insert('a');
    const updated = await db.transaction((tx) =>
      // @ts-expect-error version exclue des valeurs modifiables
      updateWithVersion(tx, widgets, { id: row.id, version: 1 }, { label: 'b', version: 99 }),
    );
    expect(updated?.version).toBe(2);
  });

  it('hors transaction : refusé par le type', () => {
    const outsideTransaction = () =>
      // @ts-expect-error un client de pool n'est pas une transaction (pas de rollback)
      updateWithVersion(db, widgets, { id: MISSING, version: 1 }, { label: 'x' });
    expect(typeof outsideTransaction).toBe('function');
  });

  it('created_at et updated_at ne se fixent pas par les valeurs', async () => {
    const row = await insert('a');
    const past = new Date('2000-01-01T00:00:00Z');
    const updated = await db.transaction((tx) =>
      // @ts-expect-error colonnes tenues par columns.ts
      updateWithVersion(tx, widgets, { id: row.id, version: 1 }, { label: 'b', createdAt: past, updatedAt: past }),
    );
    expect(updated?.createdAt.getTime()).toBe(row.createdAt.getTime());
    expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
  });

  describe('deux mises à jour concurrentes avec la même version', () => {
    type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };
    const settle = <T>(promise: Promise<T>): Promise<Outcome<T>> =>
      promise.then(
        (value) => ({ ok: true, value }),
        (error: unknown) => ({ ok: false, error }),
      );

    /**
     * T1 met à jour et garde son verrou ; T2 tente la même version et attend ce verrou (constaté dans
     * pg_blocking_pids) ; T1 se termine ensuite (`commit` ou `rollback`).
     */
    async function race(end: 'commit' | 'rollback') {
      const row = await insert('origine');
      const { promise: released, fire: release } = signal();
      const { promise: t1Ready, fire: t1Updated } = signal();
      let t1Pid = 0;
      let t2Pid = 0;
      const pid = async (tx: { execute: NodePgDatabase['execute'] }) =>
        (await tx.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`)).rows[0]?.pid ?? 0;

      const t1 = settle(
        db.transaction(async (tx) => {
          t1Pid = await pid(tx);
          const result = await updateWithVersion(tx, widgets, { id: row.id, version: 1 }, { label: 't1' });
          t1Updated();
          await released;
          if (end === 'rollback') tx.rollback();
          return result;
        }),
      );
      await t1Ready;
      const t2 = settle(
        db.transaction(async (tx) => {
          t2Pid = await pid(tx);
          return updateWithVersion(tx, widgets, { id: row.id, version: 1 }, { label: 't2' });
        }),
      );
      for (let i = 0; ; i++) {
        const { rows } = await pool.query<{ blocked: boolean }>(
          'SELECT $1::int = ANY(pg_blocking_pids($2::int)) AS blocked',
          [t1Pid, t2Pid],
        );
        if (t2Pid !== 0 && rows[0]?.blocked) break;
        if (i > 300) throw new Error('T2 n’a jamais attendu le verrou de T1');
        await sleep(10);
      }
      release();
      const [r1, r2] = await Promise.all([t1, t2]);
      const [current] = await db.select().from(widgets).where(eq(widgets.id, row.id));
      return { r1, r2, current };
    }

    it('T1 valide : T2 relit la version validée, une seule réussit', async () => {
      const { r1, r2, current } = await race('commit');
      expect(r1).toMatchObject({ ok: true, value: { label: 't1', version: 2 } });
      expect(r2.ok ? null : r2.error).toBeInstanceOf(VersionConflictError);
      expect(current).toMatchObject({ label: 't1', version: 2 });
    });

    it('T1 annule : T2, après l’attente du verrou, réussit', async () => {
      const { r1, r2, current } = await race('rollback');
      expect(r1.ok).toBe(false);
      expect(r2).toMatchObject({ ok: true, value: { label: 't2', version: 2 } });
      expect(current).toMatchObject({ label: 't2', version: 2 });
    });
  });

  describe('sous RLS (cotiz_app, contexte posé dans la transaction)', () => {
    let rowOfB: string;
    let moussaRow: string;

    beforeAll(async () => {
      // Données posées hors RLS (superutilisateur) : la RLS forcée s'applique aussi au propriétaire.
      const seedPool = new pg.Pool({ connectionString: tdb.superuserUrl, max: 1 });
      const rows = await drizzle({ client: seedPool })
        .insert(tenantWidgets)
        .values([
          { associationId: B, label: 'b' },
          { associationId: A, userId: MOUSSA, label: 'a-moussa' },
        ])
        .returning();
      await seedPool.end();
      rowOfB = rows[0]?.id ?? '';
      moussaRow = rows[1]?.id ?? '';
    });

    const updateAs = (context: { aid?: string; uid?: string; space: string }, rowId: string, version: number) =>
      app.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.association_id', ${context.aid ?? ''}, true),
                                    set_config('app.user_id', ${context.uid ?? ''}, true),
                                    set_config('app.space', ${context.space}, true)`);
        return updateWithVersion(tx, tenantWidgets, { id: rowId, version }, { label: 'modifié' });
      });

    it('ligne d’une autre association : null (404), quelle que soit la version', async () => {
      for (const version of [1, 2]) {
        expect(await updateAs({ aid: A, space: 'association' }, rowOfB, version)).toBeNull();
      }
    });

    it('ligne lisible mais non modifiable (lecture souscripteur) : null, ni existence ni version révélées', async () => {
      // Témoin : la ligne est bien visible en lecture dans ce contexte.
      const visible = await app.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT set_config('app.user_id', ${MOUSSA}, true), set_config('app.space', 'subscriber', true)`,
        );
        return tx.select().from(tenantWidgets);
      });
      expect(visible.map((r) => r.id)).toEqual([moussaRow]);
      for (const version of [1, 2]) {
        expect(await updateAs({ uid: MOUSSA, space: 'subscriber' }, moussaRow, version)).toBeNull();
      }
    });

    it('dans son association : la mise à jour aboutit, puis la version périmée lève version_conflict', async () => {
      expect(await updateAs({ aid: A, space: 'association' }, moussaRow, 1)).toMatchObject({ version: 2 });
      await expect(updateAs({ aid: A, space: 'association' }, moussaRow, 1)).rejects.toBeInstanceOf(
        VersionConflictError,
      );
    });
  });
});
