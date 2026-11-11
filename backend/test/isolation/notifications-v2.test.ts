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
 * Isolation des tables du lot 4.2 (base migrée) :
 * - notification_preferences et push_subscriptions : tables personnelles, owner_access (la personne, quel que soit
 *   l'espace) et system_access (worker) ; aucune politique d'association.
 * - message_templates : modèles de la plateforme lisibles par tous (association_id NULL, lecture seule), modèles d'une
 *   association lus et écrits dans son seul contexte.
 * Chaque politique est aussi testée affaiblie.
 */

const P = {
  moussa: '00000000-0000-7000-8000-0000000f0a01',
  fatou: '00000000-0000-7000-8000-0000000f0b01',
} as const;

const T = {
  platform: '00000000-0000-7000-8000-0000000f1001',
  a: '00000000-0000-7000-8000-0000000f1a01',
  b: '00000000-0000-7000-8000-0000000f1b01',
} as const;

const ids = (tx: Tx, query: ReturnType<typeof sql>) =>
  tx.execute<{ id: string }>(query).then((r) => r.rows.map((row) => row.id));

const visibleSubscriptions = (tx: Tx) => ids(tx, sql`SELECT id FROM push_subscriptions ORDER BY id`);
const visibleTemplates = (tx: Tx) => ids(tx, sql`SELECT id FROM message_templates ORDER BY id`);
const visiblePreferences = (tx: Tx) =>
  tx
    .execute<{ user_id: string }>(sql`SELECT user_id FROM notification_preferences ORDER BY user_id`)
    .then((r) => r.rows.map((row) => row.user_id));

const insertSubscription = (tx: Tx, id: string, userId: string) =>
  tx.execute(sql`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
                 VALUES (${id}, ${userId}, ${`https://push.example/${id}`}, 'k', 'a')`);

const insertTemplate = (tx: Tx, id: string, associationId: string | null) =>
  tx.execute(sql`INSERT INTO message_templates (id, association_id, key, channel, subject, body)
                 VALUES (${id}, ${associationId}, 'payment.validated', 'push', 's', 'b')`);

async function asSystem(h: IsolationHarness, query: string): Promise<string[]> {
  return h.superuserRollback(async (client) => {
    await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
    return (await client.query<{ id: string }>(query)).rows.map((r) => r.id);
  });
}

describe('isolation : préférences, abonnements push et modèles de messages (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO notification_preferences (user_id, type, channel, enabled)
       VALUES ($1, 'payment.validated', 'push', false), ($2, 'payment.validated', 'push', false),
              ($3, 'payment.declared', 'in_app', true)`,
      [USERS.moussa, USERS.fatou, USERS.awa],
    );
    await h.superuser(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
       VALUES ($1, $3, 'https://push.example/m', 'k', 'a'), ($2, $4, 'https://push.example/f', 'k', 'a')`,
      [P.moussa, P.fatou, USERS.moussa, USERS.fatou],
    );
    await h.superuser(
      `INSERT INTO message_templates (id, association_id, key, channel, subject, body)
       VALUES ($1, NULL, 'payment.validated', 'push', 's', 'b'), ($2, $4, 'payment.validated', 'push', 's', 'b'),
              ($3, $5, 'payment.validated', 'push', 's', 'b')`,
      [T.platform, T.a, T.b, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('préférences et abonnements push : tables personnelles', () => {
    it('chaque personne ne voit que les siens, dans tout espace', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visiblePreferences)).toEqual([USERS.moussa]);
      expect(await h.as(asSubscriber(USERS.moussa), visibleSubscriptions)).toEqual([P.moussa]);
      expect(await h.as(asSubscriber(USERS.fatou), visibleSubscriptions)).toEqual([P.fatou]);
      expect(await h.as(asManagerOf(A), visiblePreferences)).toEqual([USERS.awa]);
    });

    it('un gestionnaire ne voit ni les préférences ni les appareils des souscripteurs de son association', async () => {
      expect(await h.as(asManagerOf(A), visibleSubscriptions)).toEqual([]);
      expect(await h.as(asManagerOf(A), visiblePreferences)).not.toContain(USERS.moussa);
    });

    it('sans contexte, en espace public ou sans personne : rien', async () => {
      for (const table of ['notification_preferences', 'push_subscriptions']) {
        expect(await h.countWithoutTenantDatabase(table)).toBe(0);
        expect(await h.count(null, table)).toBe(0);
        expect(await h.count({ space: 'public' }, table)).toBe(0);
        expect(await h.count({ space: 'association', associationId: A.id }, table)).toBe(0);
      }
    });

    it('espace system (worker) : toutes les lignes', async () => {
      expect(await asSystem(h, 'SELECT id FROM push_subscriptions ORDER BY id')).toEqual([P.moussa, P.fatou]);
      expect(await asSystem(h, 'SELECT user_id AS id FROM notification_preferences ORDER BY user_id')).toHaveLength(3);
    });

    it('personne n’abonne l’appareil ni ne règle les préférences d’une autre personne', async () => {
      const sub = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertSubscription(tx, '00000000-0000-7000-8000-0000000f0c01', USERS.fatou),
        ),
      );
      expect(isRlsViolation(sub)).toBe(true);
      const pref = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`INSERT INTO notification_preferences (user_id, type, channel, enabled)
                         VALUES (${USERS.moussa}, 'payment.rejected', 'push', false)`),
        ),
      );
      expect(isRlsViolation(pref)).toBe(true);
    });

    it('personne ne révoque l’appareil d’une autre personne ; la personne, le sien', async () => {
      const other = await h.asRollback(asSubscriber(USERS.fatou), (tx) =>
        tx.execute(sql`UPDATE push_subscriptions SET revoked_at = now() WHERE id = ${P.moussa}`),
      );
      expect(other.rowCount).toBe(0);
      const own = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`UPDATE push_subscriptions SET revoked_at = now() WHERE id = ${P.moussa}`),
      );
      expect(own.rowCount).toBe(1);
    });

    it('endpoint unique : un même appareil n’appartient qu’à une ligne', async () => {
      const error = await errorOf(
        h.superuser(
          `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth)
           VALUES ('00000000-0000-7000-8000-0000000f0c02', $1, 'https://push.example/m', 'k', 'a')`,
          [USERS.fatou],
        ),
      );
      expect((error as { code?: string }).code).toBe('23505');
    });
  });

  describe('modèles de messages', () => {
    it('chaque association lit les modèles de la plateforme et les siens, jamais ceux d’une autre', async () => {
      expect(await h.as(asManagerOf(A), visibleTemplates)).toEqual([T.platform, T.a]);
      expect(await h.as(asManagerOf(B), visibleTemplates)).toEqual([T.platform, T.b]);
    });

    it('hors contexte d’association : les modèles de la plateforme seulement', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visibleTemplates)).toEqual([T.platform]);
      expect(await h.as({ space: 'public' }, visibleTemplates)).toEqual([T.platform]);
    });

    it('une association n’écrit ni un modèle d’une autre ni un modèle de la plateforme', async () => {
      for (const target of [B.id, null]) {
        const error = await errorOf(
          h.asRollback(asManagerOf(A), (tx) => insertTemplate(tx, '00000000-0000-7000-8000-0000000f1c01', target)),
        );
        expect(isRlsViolation(error)).toBe(true);
      }
      const changed = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE message_templates SET body = 'x' WHERE id IN (${T.platform}, ${T.b})`),
      );
      expect(changed.rowCount).toBe(0);
    });

    it('une association écrit ses propres modèles', async () => {
      const written = await h.asRollback(asManagerOf(A), (tx) =>
        insertTemplate(tx, '00000000-0000-7000-8000-0000000f1c02', A.id),
      );
      expect(written.rowCount).toBe(1);
    });

    it('une association ne fait passer aucun de ses modèles à la plateforme ni à une autre association', async () => {
      for (const target of [null, B.id]) {
        const error = await errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`UPDATE message_templates SET association_id = ${target} WHERE id = ${T.a}`),
          ),
        );
        expect(isRlsViolation(error)).toBe(true);
      }
    });
  });

  describe('déplacement d’une ligne vers une autre personne', () => {
    it('personne ne transfère son appareil ni ses préférences à une autre personne', async () => {
      const sub = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          tx.execute(sql`UPDATE push_subscriptions SET user_id = ${USERS.fatou} WHERE id = ${P.moussa}`),
        ),
      );
      expect(isRlsViolation(sub)).toBe(true);
      const pref = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          tx.execute(sql`UPDATE notification_preferences SET user_id = ${USERS.fatou} WHERE user_id = ${USERS.moussa}`),
        ),
      );
      expect(isRlsViolation(pref)).toBe(true);
    });
  });

  describe('politiques affaiblies : le test échoue', () => {
    it('owner_access des préférences sans WITH CHECK : on réglerait les préférences d’autrui', async () => {
      const written = await h.withPolicy(
        'notification_preferences',
        'owner_access',
        { using: 'user_id = app_user_id()', withCheck: 'true' },
        () =>
          h.asRollback(asSubscriber(USERS.moussa), (tx) =>
            tx.execute(sql`INSERT INTO notification_preferences (user_id, type, channel, enabled)
                           VALUES (${USERS.fatou}, 'payment.rejected', 'push', false)`),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('tenant_templates sans WITH CHECK : un modèle de A deviendrait un modèle de la plateforme', async () => {
      const moved = await h.withPolicy(
        'message_templates',
        'tenant_templates',
        { using: 'association_id = app_association_id()', withCheck: 'true' },
        () =>
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`UPDATE message_templates SET association_id = NULL WHERE id = ${T.a}`),
          ),
      );
      expect(moved.rowCount).toBe(1);
    });

    it('owner_access ne dépend plus de la personne', async () => {
      for (const table of ['notification_preferences', 'push_subscriptions']) {
        const leaked = await h.withPolicy(
          table,
          'owner_access',
          { using: 'user_id IS NOT NULL', withCheck: 'user_id IS NOT NULL' },
          () => h.count(asManagerOf(A), table),
        );
        expect(leaked).toBeGreaterThan(1);
      }
    });

    it('owner_access sans WITH CHECK sur la personne : on abonnerait l’appareil d’autrui', async () => {
      const written = await h.withPolicy(
        'push_subscriptions',
        'owner_access',
        { using: 'user_id = app_user_id()', withCheck: 'true' },
        () =>
          h.asRollback(asSubscriber(USERS.moussa), (tx) =>
            insertSubscription(tx, '00000000-0000-7000-8000-0000000f0c03', USERS.fatou),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('system_access ouverte hors de l’espace system', async () => {
      for (const table of ['notification_preferences', 'push_subscriptions']) {
        const leaked = await h.withPolicy(
          table,
          'system_access',
          { using: "app_space() <> 'none'", withCheck: "app_space() <> 'none'" },
          () => h.count(asSubscriber(USERS.aminata), table),
        );
        expect(leaked).toBeGreaterThan(0);
      }
    });

    it('tenant_templates ne dépend plus de l’association : A lit les modèles de B', async () => {
      const leaked = await h.withPolicy(
        'message_templates',
        'tenant_templates',
        { using: 'association_id IS NOT NULL', withCheck: 'association_id IS NOT NULL' },
        () => h.as(asManagerOf(A), visibleTemplates),
      );
      expect(leaked).toContain(T.b);
    });

    it('platform_templates_read ouverte à toute ligne : B lirait les modèles de A', async () => {
      const leaked = await h.withPolicy(
        'message_templates',
        'platform_templates_read',
        { using: 'true', withCheck: null },
        () => h.as(asManagerOf(B), visibleTemplates),
      );
      expect(leaked).toContain(T.a);
    });
  });
});
