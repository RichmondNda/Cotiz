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
  pgCode,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des tables du lot 4.6 (base migrée). invoices et export_jobs : seulement dans le contexte de leur
 * association (tenant_isolation, forcée) — la plateforme lit les factures par sa connexion BYPASSRLS, le worker les
 * écrit dans le contexte de chaque association. usage_daily : l'association et l'espace system (tâche usage.daily).
 * Aucun accès souscripteur, public ou sans contexte. Factures : pas de suppression physique, numéro unique.
 * Chaque politique est aussi testée affaiblie.
 */

const PLAN = '00000000-0000-7000-8000-0000000461a1';
const SUBSCRIPTION = { a: '00000000-0000-7000-8000-0000000462a1', b: '00000000-0000-7000-8000-0000000462b1' } as const;
const INVOICE = { a: '00000000-0000-7000-8000-0000000463a1', b: '00000000-0000-7000-8000-0000000463b1' } as const;
const EXPORT = { a: '00000000-0000-7000-8000-0000000464a1', b: '00000000-0000-7000-8000-0000000464b1' } as const;

type Table = 'invoices' | 'export_jobs' | 'usage_daily';
const TENANT_TABLES: readonly Table[] = ['invoices', 'export_jobs', 'usage_daily'];

/** Lignes visibles, par leur association (usage_daily n'a pas d'id). */
const seen = (table: Table) => (tx: Tx) =>
  tx
    .execute<{ k: string }>(sql`SELECT association_id::text AS k FROM ${sql.identifier(table)} ORDER BY 1`)
    .then((r) => r.rows.map((row) => row.k));

const insertInvoice = (tx: Tx, id: string, associationId: string, subscriptionId: string, number: string) =>
  tx.execute(sql`INSERT INTO invoices (id, association_id, subscription_id, number, period_start, period_end, amount)
                 VALUES (${id}, ${associationId}, ${subscriptionId}, ${number}, '2026-12-01', '2026-12-31', 10000)`);

describe('isolation : factures, exports et usage (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
                          features)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, 5, 100, 2, '{exports}')`,
      [PLAN],
    );
    await h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
       VALUES ($1, $3, $5, 'monthly', 'active', '2026-11-01'), ($2, $4, $5, 'monthly', 'active', '2026-11-01')`,
      [SUBSCRIPTION.a, SUBSCRIPTION.b, A.id, B.id, PLAN],
    );
    await h.superuser(
      `INSERT INTO invoices (id, association_id, subscription_id, number, period_start, period_end, amount, status)
       VALUES ($1, $3, $5, 'CTZ-2026-000001', '2026-11-01', '2026-11-30', 10000, 'open'),
              ($2, $4, $6, 'CTZ-2026-000002', '2026-11-01', '2026-11-30', 10000, 'open')`,
      [INVOICE.a, INVOICE.b, A.id, B.id, SUBSCRIPTION.a, SUBSCRIPTION.b],
    );
    await h.superuser(
      `INSERT INTO export_jobs (id, association_id, requested_by, kind)
       VALUES ($1, $3, $5, 'members_csv'), ($2, $4, $6, 'members_csv')`,
      [EXPORT.a, EXPORT.b, A.id, B.id, A.managerId, B.managerId],
    );
    await h.superuser(
      `INSERT INTO usage_daily (association_id, day, logins, active_users, payments_declared, payments_validated,
                                avg_validation_hours)
       VALUES ($1, '2026-11-12', 4, 3, 2, 1, 5.5), ($2, '2026-11-12', 1, 1, 0, 0, 0)`,
      [A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  it('chaque association ne voit que ses factures, ses exports et son usage', async () => {
    for (const table of TENANT_TABLES) {
      expect(await h.as(asManagerOf(A), seen(table))).toEqual([A.id]);
      expect(await h.as(asManagerOf(B), seen(table))).toEqual([B.id]);
    }
  });

  it('souscripteur, espace public, sans contexte : rien', async () => {
    for (const table of TENANT_TABLES) {
      expect(await h.countWithoutTenantDatabase(table)).toBe(0);
      expect(await h.count(null, table)).toBe(0);
      expect(await h.count({ space: 'public' }, table)).toBe(0);
      expect(await h.as(asSubscriber(USERS.moussa), seen(table))).toEqual([]);
    }
  });

  it('espace system : usage_daily de toutes les associations, mais ni factures ni exports', async () => {
    const read = (table: Table) =>
      h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        const res = await client.query<{ k: string }>(`SELECT association_id::text AS k FROM ${table} ORDER BY 1`);
        return res.rows.map((r) => r.k);
      });
    expect(await read('usage_daily')).toEqual([A.id, B.id]);
    expect(await read('invoices')).toEqual([]);
    expect(await read('export_jobs')).toEqual([]);
  });

  it('A ne crée ni facture ni export au nom de B', async () => {
    const invoice = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        insertInvoice(tx, '00000000-0000-7000-8000-0000000463c1', B.id, SUBSCRIPTION.b, 'CTZ-2026-000003'),
      ),
    );
    expect(isRlsViolation(invoice)).toBe(true);
    const job = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`INSERT INTO export_jobs (id, association_id, requested_by, kind)
                       VALUES ('00000000-0000-7000-8000-0000000464c1', ${B.id}, ${A.managerId}, 'members_csv')`),
      ),
    );
    expect(isRlsViolation(job)).toBe(true);
  });

  it("A ne modifie ni la facture ni l'export de B ; les siens, oui", async () => {
    const other = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE invoices SET status = 'paid' WHERE id = ${INVOICE.b}`),
    );
    expect(other.rowCount).toBe(0);
    const otherJob = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE export_jobs SET status = 'done' WHERE id = ${EXPORT.b}`),
    );
    expect(otherJob.rowCount).toBe(0);
    const own = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE export_jobs SET status = 'done' WHERE id = ${EXPORT.a}`),
    );
    expect(own.rowCount).toBe(1);
  });

  it('A ne déplace pas sa facture dans B (WITH CHECK)', async () => {
    const moved = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE invoices SET association_id = ${B.id} WHERE id = ${INVOICE.a}`),
      ),
    );
    expect(isRlsViolation(moved)).toBe(true);
  });

  it('une facture ne se supprime jamais, même la sienne (DELETE retiré)', async () => {
    const removed = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => tx.execute(sql`DELETE FROM invoices WHERE id = ${INVOICE.a}`)),
    );
    expect(pgCode(removed)).toBe('42501');
  });

  it('un numéro de facture est unique, toutes associations confondues', async () => {
    const twice = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        insertInvoice(tx, '00000000-0000-7000-8000-0000000463d1', A.id, SUBSCRIPTION.a, 'CTZ-2026-000002'),
      ),
    );
    expect(pgCode(twice)).toBe('23505');
  });

  describe('politiques affaiblies : le test échoue', () => {
    for (const table of TENANT_TABLES) {
      it(`tenant_isolation de ${table} ouverte : A lit la ligne de B`, async () => {
        const leaked = await h.withPolicy(table, 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
          h.as(asManagerOf(A), seen(table)),
        );
        expect(leaked).toEqual([A.id, B.id].sort());
      });
    }

    it('system_access de usage_daily ouverte à tout espace : le souscripteur lit tout', async () => {
      const leaked = await h.withPolicy('usage_daily', 'system_access', { using: 'true', withCheck: 'true' }, () =>
        h.as(asSubscriber(USERS.moussa), seen('usage_daily')),
      );
      expect(leaked).toEqual([A.id, B.id].sort());
    });
  });
});
