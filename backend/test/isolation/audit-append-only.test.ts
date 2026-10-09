import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, errorOf, type IsolationHarness, pgCode, pgMessage, startIsolationHarness, USERS } from './harness.js';

/**
 * Journal d'audit en ajout seul (lot 0.5, étape 2), sur la base migrée. Trois protections superposées :
 * 1. droits : cotiz_app et cotiz_platform n'ont ni UPDATE ni DELETE (42501, avant même la RLS) ;
 * 2. RLS forcée sans politique UPDATE/DELETE : le propriétaire (cotiz_migrator) ne touche aucune ligne ;
 * 3. déclencheurs forbid_mutation (lignes et TRUNCATE) : même un superutilisateur (hors RLS et droits) reçoit
 *    `append_only`.
 * Le scénario 6 de docs/specs/rls-smoke-test.sql (3) tourne ici, la table étant migrée depuis ce lot.
 */

async function asRole<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    try {
      return await fn(client);
    } finally {
      await client.query('ROLLBACK');
    }
  } finally {
    await client.end();
  }
}

const MUTATIONS = [
  ['DELETE', 'DELETE FROM audit_logs'],
  ['UPDATE', "UPDATE audit_logs SET action = 'falsifie'"],
  ['TRUNCATE', 'TRUNCATE audit_logs'],
] as const;

describe('audit_logs en ajout seul (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await h.superuser(
      `INSERT INTO audit_logs (association_id, actor_user_id, actor_role, action, entity_type)
       VALUES ($1, $2, 'owner', 'payment.validate', 'payment')`,
      [A.id, USERS.awa],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  it.each(['cotiz_app', 'cotiz_platform'] as const)(
    '%s : UPDATE, DELETE et TRUNCATE refusés par les droits',
    async (role) => {
      for (const [verb, statement] of MUTATIONS) {
        const error = await asRole(h.db.urlFor(role), (c) => errorOf(c.query(statement)));
        expect({ verb, code: pgCode(error), message: pgMessage(error) }).toEqual({
          verb,
          code: '42501',
          message: 'permission denied for table audit_logs',
        });
      }
    },
  );

  it('cotiz_app, même dans le contexte de l’association : refus par les droits', async () => {
    for (const [verb, statement] of MUTATIONS.slice(0, 2)) {
      const error = await asRole(h.db.urlFor('cotiz_app'), async (c) => {
        await c.query(
          "SELECT set_config('app.association_id', $1, true), set_config('app.space', 'association', true)",
          [A.id],
        );
        return errorOf(c.query(statement));
      });
      expect({ verb, code: pgCode(error) }).toEqual({ verb, code: '42501' });
    }
  });

  it('cotiz_migrator (propriétaire, RLS forcée) : aucune ligne modifiée ni supprimée', async () => {
    const touched = await asRole(h.db.urlFor('cotiz_migrator'), async (c) => {
      const deleted = await c.query('DELETE FROM audit_logs');
      const updated = await c.query("UPDATE audit_logs SET action = 'falsifie'");
      return [deleted.rowCount, updated.rowCount];
    });
    expect(touched).toEqual([0, 0]);
  });

  it('6. superutilisateur : DELETE → append_only (scénario 6 du test de fumée)', async () => {
    const error = await h.superuserRollback(async (client) => {
      await client.query(
        `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_role, action, entity_type, entity_id, before, after,
                                 request_id, ip, user_agent)
         VALUES (now(), $1, 'owner', 'test', 'x', $1, '{}', '{}', 'r', '127.0.0.1', 'psql')`,
        [USERS.awa],
      );
      return errorOf(client.query('DELETE FROM audit_logs'));
    });
    expect(pgMessage(error)).toBe('append_only');
    expect(pgCode(error)).toBe('P0001');
  });

  it('superutilisateur : UPDATE → append_only', async () => {
    const error = await h.superuserRollback((client) =>
      errorOf(client.query("UPDATE audit_logs SET action = 'falsifie'")),
    );
    expect(pgMessage(error)).toBe('append_only');
  });

  it('TRUNCATE (qui ignore RLS et déclencheurs de ligne) → append_only, pour le propriétaire et le superutilisateur', async () => {
    const asOwner = await asRole(h.db.urlFor('cotiz_migrator'), (c) => errorOf(c.query('TRUNCATE audit_logs')));
    const asSuperuser = await h.superuserRollback((client) => errorOf(client.query('TRUNCATE audit_logs')));
    expect([pgMessage(asOwner), pgMessage(asSuperuser)]).toEqual(['append_only', 'append_only']);
  });

  it('le journal est intact après toutes ces tentatives', async () => {
    const { rows } = await h.superuser('SELECT action FROM audit_logs');
    expect(rows).toEqual([{ action: 'payment.validate' }]);
  });

  it('contre-épreuve : sans le déclencheur, le superutilisateur supprimerait la ligne', async () => {
    await h.migrator('ALTER TABLE audit_logs DISABLE TRIGGER audit_append_only');
    try {
      const deleted = await h.superuserRollback((client) => client.query('DELETE FROM audit_logs'));
      expect(deleted.rowCount).toBe(1);
    } finally {
      await h.migrator('ALTER TABLE audit_logs ENABLE TRIGGER audit_append_only');
    }
  });

  it('contre-épreuve : avec les droits rendus, cotiz_app n’est plus arrêté par les droits', async () => {
    await h.migrator('GRANT DELETE ON audit_logs TO cotiz_app');
    try {
      const deleted = await asRole(h.db.urlFor('cotiz_app'), (c) => c.query('DELETE FROM audit_logs'));
      // Plus de 42501 : seule la RLS (aucune politique DELETE) l'empêche encore de toucher une ligne.
      expect(deleted.rowCount).toBe(0);
    } finally {
      await h.migrator('REVOKE DELETE ON audit_logs FROM cotiz_app');
    }
  });
});
