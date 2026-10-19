import { sql } from 'drizzle-orm';
import pg from 'pg';
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
  pgConstraint,
  pgMessage,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Tables billing du lot 1.2 (base migrée). plans : table globale sans RLS (architecture/02), lisible depuis tous les
 * espaces ; la limite au module billing relève des frontières de modules (étape 4). subscriptions : l'association (tenant_isolation) et le worker (system_access) ; une seule
 * souscription en cours (trialing, active, past_due) par association. Chaque politique est aussi testée affaiblie.
 */

const PLANS = {
  essentiel: '00000000-0000-7000-8000-0000000001a1',
  pro: '00000000-0000-7000-8000-0000000002a2',
} as const;

const SUBSCRIPTIONS = {
  activeA: '00000000-0000-7000-8000-0000000005a1',
  canceledA: '00000000-0000-7000-8000-0000000005a2',
  trialingB: '00000000-0000-7000-8000-0000000005b1',
} as const;

const subscriptions = (tx: Tx) =>
  tx.execute<{ id: string }>(sql`SELECT id FROM subscriptions ORDER BY id`).then((r) => r.rows.map((row) => row.id));

const insertSubscription = (tx: Tx, associationId: string) =>
  tx.execute(sql`INSERT INTO subscriptions (id, association_id, plan_id, billing_period, current_period_start)
                 VALUES (gen_random_uuid(), ${associationId}, ${PLANS.pro}, 'monthly', '2026-10-01')`);

const ALL_SUBSCRIPTIONS = [SUBSCRIPTIONS.activeA, SUBSCRIPTIONS.canceledA, SUBSCRIPTIONS.trialingB];

describe('tables billing : plans et subscriptions (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
                          features, is_featured)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, 5, 100, 2, '{auto_reminders}', true),
              ($2, 'pro', 'Pro', 25000, 300000, NULL, 500, 5, '{auto_reminders,imports,exports}', false)`,
      [PLANS.essentiel, PLANS.pro],
    );
    await h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
       VALUES ($1, $4, $5, 'monthly', 'active', '2026-10-01'),
              ($2, $4, $6, 'yearly', 'canceled', '2025-10-01'),
              ($3, $7, $6, 'monthly', 'trialing', '2026-10-01')`,
      [SUBSCRIPTIONS.activeA, SUBSCRIPTIONS.canceledA, SUBSCRIPTIONS.trialingB, A.id, PLANS.essentiel, PLANS.pro, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('subscriptions : isolation', () => {
    it('chaque association ne voit que ses souscriptions, en cours ou passées', async () => {
      expect(await h.as(asManagerOf(A), subscriptions)).toEqual([SUBSCRIPTIONS.activeA, SUBSCRIPTIONS.canceledA]);
      expect(await h.as(asManagerOf(B), subscriptions)).toEqual([SUBSCRIPTIONS.trialingB]);
    });

    it.each([
      ['souscripteur', asSubscriber(USERS.moussa)],
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['auth', { space: 'auth', userId: USERS.awa }],
      ['public', { space: 'public' }],
    ] as const)('espace %s : aucune souscription', async (_name, context) => {
      expect(await h.as(context, subscriptions)).toEqual([]);
    });

    it('sans contexte, ou sans aucune variable app.* : rien', async () => {
      expect(await h.count(null, 'subscriptions')).toBe(0);
      expect(await h.countWithoutTenantDatabase('subscriptions')).toBe(0);
    });

    it('espace system (worker) : toutes les souscriptions', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        return (await client.query<{ id: string }>('SELECT id FROM subscriptions ORDER BY id')).rows.map((r) => r.id);
      });
      expect(seen).toEqual(ALL_SUBSCRIPTIONS);
    });

    it('une association ne crée ni ne déplace une souscription chez une autre', async () => {
      expect(isRlsViolation(await errorOf(h.asRollback(asManagerOf(A), (tx) => insertSubscription(tx, B.id))))).toBe(
        true,
      );
      const moved = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`UPDATE subscriptions SET association_id = ${B.id} WHERE id = ${SUBSCRIPTIONS.canceledA}`),
        ),
      );
      expect(isRlsViolation(moved)).toBe(true);
    });

    // DELETE : refusé à tous par le droit lui-même (bloc « droits » ci-dessous).
    it('une association ne modifie pas la souscription d’une autre', async () => {
      const updated = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE subscriptions SET status = 'canceled' WHERE id = ${SUBSCRIPTIONS.trialingB}`),
      );
      expect(updated.rowCount).toBe(0);
    });

    it('un souscripteur ne crée pas de souscription', async () => {
      const error = await errorOf(h.asRollback(asSubscriber(USERS.moussa), (tx) => insertSubscription(tx, A.id)));
      expect(isRlsViolation(error)).toBe(true);
    });
  });

  describe('subscriptions : invariants', () => {
    it.each(['trialing', 'active', 'past_due'])(
      'une seule souscription en cours par association : une seconde « %s » est refusée',
      async (status) => {
        const error = await h.superuserRollback((client) =>
          errorOf(
            client.query(
              `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
               VALUES (gen_random_uuid(), $1, $2, 'monthly', $3, '2026-10-01')`,
              [A.id, PLANS.pro, status],
            ),
          ),
        );
        expect(pgCode(error)).toBe('23505');
        expect(pgConstraint(error)).toBe('subscriptions_one_active');
      },
    );

    it.each(['suspended', 'canceled'])('une souscription « %s » s’ajoute à celle en cours', async (status) => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
             VALUES (gen_random_uuid(), $1, $2, 'monthly', $3, '2026-10-01')`,
            [A.id, PLANS.pro, status],
          ),
        ),
      );
      expect(error).toBeNull();
    });

    it('une souscription neuve est à l’essai par défaut', async () => {
      const status = await h.superuserRollback(async (client) => {
        await client.query(`DELETE FROM subscriptions WHERE association_id = $1`, [B.id]);
        const { rows } = await client.query<{ status: string }>(
          `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, current_period_start)
           VALUES (gen_random_uuid(), $1, $2, 'monthly', '2026-10-01') RETURNING status`,
          [B.id, PLANS.pro],
        );
        return rows[0]?.status;
      });
      expect(status).toBe('trialing');
    });

    it.each([
      ['association inconnue', '00000000-0000-7000-8000-00000000a999', PLANS.pro],
      ['plan inconnu', A.id, '00000000-0000-7000-8000-0000000009a9'],
    ])('%s : refusée par clé étrangère', async (_name, associationId, planId) => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
             VALUES (gen_random_uuid(), $1, $2, 'monthly', 'canceled', '2026-10-01')`,
            [associationId, planId],
          ),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('un plan auquel une association a souscrit ne se supprime pas (on l’archive)', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(client.query('DELETE FROM plans WHERE id = $1', [PLANS.essentiel])),
      );
      expect(pgCode(error)).toBe('23503');
    });
  });

  describe('plans', () => {
    it('code unique', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
             VALUES (gen_random_uuid(), 'pro', 'Autre', 0, 0, '{}')`,
          ),
        ),
      );
      expect(pgCode(error)).toBe('23505');
      expect(pgConstraint(error)).toBe('plans_code_key');
    });

    it('valeurs par défaut : XOF, actif, non mis en avant, version 1, quotas illimités', async () => {
      const row = await h.superuserRollback(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
           VALUES (gen_random_uuid(), 'decouverte', 'Découverte', 0, 0, '{}')
           RETURNING currency, is_active, is_featured, version, archived_at, max_projects, max_subscribers,
                     max_managers`,
        );
        return rows[0] as unknown;
      });
      expect(row).toEqual({
        currency: 'XOF',
        is_active: true,
        is_featured: false,
        version: 1,
        archived_at: null,
        max_projects: null,
        max_subscribers: null,
        max_managers: null,
      });
    });

    it('les prix sont des entiers exacts (bigint), jusqu’au plus grand entier sûr', async () => {
      const prices = await h.superuserRollback(async (client) => {
        const { rows } = await client.query<{ m: string; y: string }>(
          `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
           VALUES (gen_random_uuid(), 'max', 'Max', 9007199254740991, 25000, '{}')
           RETURNING price_monthly::text AS m, price_yearly::text AS y`,
        );
        return rows[0];
      });
      expect(prices).toEqual({ m: '9007199254740991', y: '25000' });
    });

    it('un prix décimal transmis en texte (paramètre) est refusé', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
             VALUES (gen_random_uuid(), 'dec', 'Dec', $1, 0, '{}')`,
            ['10000.5'],
          ),
        ),
      );
      expect(pgCode(error)).toBe('22P02');
    });

    // La base n'est pas la barrière contre les décimaux : un numeric est arrondi sans erreur. Cette barrière est le
    // contrat (z.int()) et Money (entiers sûrs) ; ce test fige le comportement pour que personne ne compte dessus.
    it('un littéral numeric est arrondi par PostgreSQL : la garde est Money et le contrat, pas la base', async () => {
      const stored = await h.superuserRollback(async (client) => {
        const { rows } = await client.query<{ m: string }>(
          `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
           VALUES (gen_random_uuid(), 'dec', 'Dec', 10000.5, 0, '{}') RETURNING price_monthly::text AS m`,
        );
        return rows[0]?.m;
      });
      expect(stored).toBe('10001');
    });

    // En cotiz_app ; /platform passera par cotiz_platform (BYPASSRLS, étape 4).
    it('table globale : lisible depuis tous les espaces, y compris public (pub.plans)', async () => {
      expect(await h.count({ space: 'public' }, 'plans')).toBe(2);
      expect(await h.count({ space: 'platform', userId: USERS.awa }, 'plans')).toBe(2);
    });
  });

  describe('droits : plans écrits par la plateforme seulement, ni plan ni abonnement supprimé', () => {
    /** Refus par un droit absent (« permission denied for table »), et non par une politique RLS. */
    const isPermissionDenied = (error: unknown) =>
      pgCode(error) === '42501' && (pgMessage(error) ?? '').startsWith('permission denied for table');

    /** Requête en cotiz_platform (connexion /platform, BYPASSRLS), toujours annulée. */
    async function asPlatformRole(text: string, values?: unknown[]): Promise<unknown> {
      const client = new pg.Client({ connectionString: h.db.urlFor('cotiz_platform') });
      await client.connect();
      try {
        await client.query('BEGIN');
        return await errorOf(client.query(text, values));
      } finally {
        await client.query('ROLLBACK');
        await client.end();
      }
    }

    const writes = {
      INSERT: sql`INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
                  VALUES (gen_random_uuid(), 'pirate', 'Pirate', 0, 0, '{}')`,
      UPDATE: sql`UPDATE plans SET price_monthly = 0 WHERE id = ${PLANS.essentiel}`,
      DELETE: sql`DELETE FROM plans WHERE id = ${PLANS.pro}`,
    };

    it.each([
      ['public', { space: 'public' }],
      ['association', asManagerOf(A)],
      ['souscripteur', asSubscriber(USERS.moussa)],
    ] as const)('cotiz_app, espace %s : INSERT, UPDATE et DELETE de plans refusés', async (_name, context) => {
      for (const [verb, statement] of Object.entries(writes)) {
        const error = await errorOf(h.asRollback(context, (tx) => tx.execute(statement)));
        expect({ verb, denied: isPermissionDenied(error) }).toEqual({ verb, denied: true });
      }
    });

    it('cotiz_app : une association ne supprime pas son propre abonnement, même résilié', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`DELETE FROM subscriptions WHERE id = ${SUBSCRIPTIONS.canceledA}`),
        ),
      );
      expect(isPermissionDenied(error)).toBe(true);
    });

    it('cotiz_platform : crée et modifie un plan', async () => {
      expect(
        await asPlatformRole(
          `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
           VALUES (gen_random_uuid(), 'nouveau', 'Nouveau', 5000, 60000, '{}')`,
        ),
      ).toBeNull();
      expect(await asPlatformRole('UPDATE plans SET archived_at = now() WHERE id = $1', [PLANS.pro])).toBeNull();
    });

    it.each([
      ['plans', PLANS.pro],
      ['subscriptions', SUBSCRIPTIONS.canceledA],
    ])('cotiz_platform : DELETE sur %s refusé (archivage ou résiliation)', async (table, id) => {
      expect(isPermissionDenied(await asPlatformRole(`DELETE FROM ${table} WHERE id = $1`, [id]))).toBe(true);
    });

    it('le test échoue si le droit revient : DELETE de plans accordé à cotiz_app, la suppression passe', async () => {
      await h.migrator('GRANT DELETE ON plans TO cotiz_app');
      try {
        const deleted = await h.asRollback({ space: 'public' }, (tx) =>
          tx.execute(sql`DELETE FROM plans WHERE code = 'pirate-inexistant'`),
        );
        expect(deleted.rowCount).toBe(0);
      } finally {
        await h.migrator('REVOKE DELETE ON plans FROM cotiz_app');
      }
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    it('subscriptions.tenant_isolation élargie : A voit les souscriptions de B', async () => {
      const seen = await h.withPolicy('subscriptions', 'tenant_isolation', { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), subscriptions),
      );
      expect(seen).toEqual(ALL_SUBSCRIPTIONS);
    });

    it('subscriptions.tenant_isolation en WITH CHECK (true) : A écrit chez B', async () => {
      const tenant = 'association_id = app_association_id()';
      const error = await h.withPolicy('subscriptions', 'tenant_isolation', { using: tenant, withCheck: 'true' }, () =>
        errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status,
                                                      current_period_start)
                           VALUES (gen_random_uuid(), ${B.id}, ${PLANS.pro}, 'monthly', 'canceled', '2026-10-01')`),
          ),
        ),
      );
      expect(error).toBeNull();
    });

    it('subscriptions.tenant_isolation retirée : A ne voit plus les siennes', async () => {
      expect(
        await h.withoutPolicy('subscriptions', 'tenant_isolation', () => h.as(asManagerOf(A), subscriptions)),
      ).toEqual([]);
    });

    it('subscriptions.system_access ouverte hors du worker : détecté', async () => {
      const open = { using: "app_space() <> 'none'", withCheck: "app_space() <> 'none'" };
      const seen = await h.withPolicy('subscriptions', 'system_access', open, () =>
        h.as(asSubscriber(USERS.moussa), subscriptions),
      );
      expect(seen).toEqual(ALL_SUBSCRIPTIONS);
    });
  });
});
