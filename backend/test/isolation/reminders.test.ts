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
 * Isolation des tables du lot 4.3 (base migrée) : reminder_rules et reminder_runs ne se lisent et ne s'écrivent que
 * dans le contexte de leur association (tenant_isolation, forcée) ou en espace system (system_access : la tâche
 * reminders.evaluate parcourt toutes les associations) ; aucun accès souscripteur, public ou sans contexte. Chaque
 * politique est aussi testée affaiblie.
 */

const RULE = { a: '00000000-0000-7000-8000-0000000f0a01', b: '00000000-0000-7000-8000-0000000f0b01' } as const;
const RUN = { a: '00000000-0000-7000-8000-0000000f1a01', b: '00000000-0000-7000-8000-0000000f1b01' } as const;
const INSTALLMENT = { a: '00000000-0000-7000-8000-0000000f2a01', b: '00000000-0000-7000-8000-0000000f2b01' } as const;

type Table = 'reminder_rules' | 'reminder_runs';
const TABLES: readonly Table[] = ['reminder_rules', 'reminder_runs'];
const OWN = { reminder_rules: RULE, reminder_runs: RUN } as const;

const ids = (table: Table) => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));

const insertRule = (tx: Tx, id: string, associationId: string) =>
  tx.execute(sql`INSERT INTO reminder_rules (id, association_id, trigger, offset_days, channels)
                 VALUES (${id}, ${associationId}, 'after_due', 3, '{in_app}')`);

const insertRun = (tx: Tx, id: string, associationId: string, ruleId: string, installmentId: string) =>
  tx.execute(sql`INSERT INTO reminder_runs (id, association_id, rule_id, installment_id, user_id, kind, status,
                                            channels, run_date)
                 VALUES (${id}, ${associationId}, ${ruleId}, ${installmentId}, ${USERS.moussa}, 'automatic',
                         'to_handle', '{in_app}', '2026-11-12')`);

describe('isolation : relances (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO reminder_rules (id, association_id, trigger, offset_days, channels)
       VALUES ($1, $3, 'after_due', 3, '{in_app}'), ($2, $4, 'before_due', 2, '{in_app,push}')`,
      [RULE.a, RULE.b, A.id, B.id],
    );
    await h.superuser(
      `INSERT INTO reminder_runs (id, association_id, rule_id, installment_id, user_id, kind, status, channels,
                                  message, run_date)
       VALUES ($1, $3, $5, $7, $9, 'automatic', 'to_handle', '{in_app}', 'Bonjour', '2026-11-12'),
              ($2, $4, $6, $8, $9, 'automatic', 'auto_sent', '{in_app}', NULL, '2026-11-12')`,
      [RUN.a, RUN.b, A.id, B.id, RULE.a, RULE.b, INSTALLMENT.a, INSTALLMENT.b, USERS.moussa],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  it('chaque association ne voit que ses règles et ses relances', async () => {
    for (const table of TABLES) {
      expect(await h.as(asManagerOf(A), ids(table))).toEqual([OWN[table].a]);
      expect(await h.as(asManagerOf(B), ids(table))).toEqual([OWN[table].b]);
    }
  });

  it('espace system (tâche reminders.evaluate) : toutes les associations', async () => {
    for (const table of TABLES) {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        return (await client.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)).rows.map((r) => r.id);
      });
      expect(seen).toEqual([OWN[table].a, OWN[table].b]);
    }
  });

  it('souscripteur, espace public, sans contexte : rien', async () => {
    for (const table of TABLES) {
      expect(await h.countWithoutTenantDatabase(table)).toBe(0);
      expect(await h.count(null, table)).toBe(0);
      expect(await h.count({ space: 'public' }, table)).toBe(0);
      expect(await h.as(asSubscriber(USERS.moussa), ids(table))).toEqual([]);
    }
  });

  it('A ne crée ni règle ni relance au nom de B', async () => {
    const rule = await errorOf(
      h.asRollback(asManagerOf(A), (tx) => insertRule(tx, '00000000-0000-7000-8000-0000000f0c01', B.id)),
    );
    expect(isRlsViolation(rule)).toBe(true);
    const run = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        insertRun(tx, '00000000-0000-7000-8000-0000000f1c01', B.id, RULE.b, INSTALLMENT.b),
      ),
    );
    expect(isRlsViolation(run)).toBe(true);
  });

  it('A ne marque ni ne supprime les relances de B ; les siennes, oui', async () => {
    const other = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE reminder_runs SET status = 'handled' WHERE id = ${RUN.b}`),
    );
    expect(other.rowCount).toBe(0);
    const removed = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`DELETE FROM reminder_rules WHERE id = ${RULE.b}`),
    );
    expect(removed.rowCount).toBe(0);
    const own = await h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`UPDATE reminder_runs SET status = 'handled' WHERE id = ${RUN.a}`),
    );
    expect(own.rowCount).toBe(1);
  });

  it('A ne déplace pas sa règle dans B (WITH CHECK)', async () => {
    const moved = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE reminder_rules SET association_id = ${B.id} WHERE id = ${RULE.a}`),
      ),
    );
    expect(isRlsViolation(moved)).toBe(true);
  });

  it('une relance est unique par règle, échéance et jour', async () => {
    const twice = await errorOf(
      h.asRollback(asManagerOf(A), (tx) =>
        insertRun(tx, '00000000-0000-7000-8000-0000000f1d01', A.id, RULE.a, INSTALLMENT.a),
      ),
    );
    expect(pgCode(twice)).toBe('23505');
  });

  describe('politiques affaiblies : le test échoue', () => {
    for (const table of TABLES) {
      it(`tenant_isolation de ${table} ouverte : A lit la ligne de B`, async () => {
        const leaked = await h.withPolicy(table, 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
          h.as(asManagerOf(A), ids(table)),
        );
        expect(leaked).toEqual([OWN[table].a, OWN[table].b]);
      });

      it(`system_access de ${table} ouverte à tout espace : le souscripteur lit tout`, async () => {
        const leaked = await h.withPolicy(table, 'system_access', { using: 'true', withCheck: 'true' }, () =>
          h.as(asSubscriber(USERS.moussa), ids(table)),
        );
        expect(leaked).toEqual([OWN[table].a, OWN[table].b]);
      });
    }
  });
});
