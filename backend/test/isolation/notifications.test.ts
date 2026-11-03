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
 * Isolation des tables du module notifications (lot 2.5, base migrée) : notifications et deliveries n'ont que
 * owner_access (la personne destinataire, quel que soit l'espace) et system_access (worker, consommateurs
 * d'événements). Aucune politique d'association : un gestionnaire ne lit pas la cloche des souscripteurs de son
 * association. Chaque politique est aussi testée affaiblie.
 */

const N = {
  awaA: '00000000-0000-7000-8000-0000000e0a01',
  moussaA: '00000000-0000-7000-8000-0000000e0a02',
  koffiB: '00000000-0000-7000-8000-0000000e0b01',
  fatouB: '00000000-0000-7000-8000-0000000e0b02',
} as const;

const D = {
  moussa: '00000000-0000-7000-8000-0000000d0a01',
  fatou: '00000000-0000-7000-8000-0000000d0b01',
} as const;

const visible = (table: 'notifications' | 'deliveries') => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));

const insertNotification = (tx: Tx, id: string, userId: string, associationId: string | null) =>
  tx.execute(sql`INSERT INTO notifications (id, user_id, association_id, type, title, body)
                 VALUES (${id}, ${userId}, ${associationId}, 'payment.validated', 't', 'b')`);

/** Lecture brute en cotiz_app dans l'espace system, comme le worker. */
async function asSystem(h: IsolationHarness, query: string): Promise<string[]> {
  return h.superuserRollback(async (client) => {
    await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
    return (await client.query<{ id: string }>(query)).rows.map((r) => r.id);
  });
}

describe('isolation : notifications et deliveries (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO notifications (id, user_id, association_id, type, title, body)
       VALUES ($1, $5, $9, 'payment.declared', 't', 'b'), ($2, $6, $9, 'payment.validated', 't', 'b'),
              ($3, $7, $10, 'payment.declared', 't', 'b'), ($4, $8, $10, 'payment.validated', 't', 'b')`,
      [N.awaA, N.moussaA, N.koffiB, N.fatouB, USERS.awa, USERS.moussa, USERS.koffi, USERS.fatou, A.id, B.id],
    );
    await h.superuser(
      `INSERT INTO deliveries (id, user_id, association_id, channel, provider, recipient_masked)
       VALUES ($1, $3, $5, 'push', 'webpush', '•••'), ($2, $4, $6, 'push', 'webpush', '•••')`,
      [D.moussa, D.fatou, USERS.moussa, USERS.fatou, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('lecture', () => {
    it('chaque personne ne voit que ses notifications, dans tout espace', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visible('notifications'))).toEqual([N.moussaA]);
      expect(await h.as(asSubscriber(USERS.fatou), visible('notifications'))).toEqual([N.fatouB]);
      expect(await h.as(asManagerOf(A), visible('notifications'))).toEqual([N.awaA]);
      expect(await h.as(asManagerOf(B), visible('notifications'))).toEqual([N.koffiB]);
    });

    it('un gestionnaire ne lit pas la cloche des souscripteurs de son association', async () => {
      const seen = await h.as(asManagerOf(A), visible('notifications'));
      expect(seen).not.toContain(N.moussaA);
    });

    it('chaque personne ne voit que ses envois ; un gestionnaire ne voit pas ceux de son association', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visible('deliveries'))).toEqual([D.moussa]);
      expect(await h.as(asSubscriber(USERS.fatou), visible('deliveries'))).toEqual([D.fatou]);
      expect(await h.as(asManagerOf(A), visible('deliveries'))).toEqual([]);
    });

    it('sans contexte, sans personne ou en espace public : rien', async () => {
      for (const table of ['notifications', 'deliveries'] as const) {
        expect(await h.withoutContext(visible(table))).toEqual([]);
        expect(await h.countWithoutTenantDatabase(table)).toBe(0);
        expect(await h.as({ space: 'public' }, visible(table))).toEqual([]);
        expect(await h.as({ space: 'association', associationId: A.id }, visible(table))).toEqual([]);
      }
    });

    it('espace system (worker) : toutes les lignes', async () => {
      expect(await asSystem(h, 'SELECT id FROM notifications ORDER BY id')).toEqual([
        N.awaA,
        N.moussaA,
        N.koffiB,
        N.fatouB,
      ]);
      expect(await asSystem(h, 'SELECT id FROM deliveries ORDER BY id')).toEqual([D.moussa, D.fatou]);
    });
  });

  describe('écriture', () => {
    it('personne ne crée une notification pour une autre personne', async () => {
      for (const context of [asManagerOf(A), asSubscriber(USERS.moussa)]) {
        const error = await errorOf(
          h.asRollback(context, (tx) =>
            insertNotification(tx, '00000000-0000-7000-8000-0000000e0c01', USERS.fatou, B.id),
          ),
        );
        expect(isRlsViolation(error)).toBe(true);
      }
    });

    it('personne ne marque lue ni ne réattribue la notification d’une autre personne', async () => {
      const read = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE notifications SET read_at = now() WHERE id = ${N.moussaA}`),
      );
      expect(read.rowCount).toBe(0);
      const moved = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          tx.execute(sql`UPDATE notifications SET user_id = ${USERS.fatou} WHERE id = ${N.moussaA}`),
        ),
      );
      expect(isRlsViolation(moved)).toBe(true);
    });

    it('personne ne supprime la notification d’une autre personne ; le destinataire, la sienne', async () => {
      const other = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`DELETE FROM notifications WHERE id = ${N.moussaA}`),
      );
      expect(other.rowCount).toBe(0);
      const own = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`DELETE FROM notifications WHERE id = ${N.moussaA}`),
      );
      expect(own.rowCount).toBe(1);
    });

    it('personne ne crée un envoi pour une autre personne', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`INSERT INTO deliveries (id, user_id, association_id, channel, provider, recipient_masked)
                         VALUES ('00000000-0000-7000-8000-0000000d0c01', ${USERS.moussa}, ${A.id}, 'push', 'webpush',
                                 '•••')`),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('le destinataire marque sa notification lue', async () => {
      const read = await h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(sql`UPDATE notifications SET read_at = now() WHERE id = ${N.moussaA}`),
      );
      expect(read.rowCount).toBe(1);
    });
  });

  describe('politiques affaiblies : le test échoue', () => {
    it('owner_access ne dépend plus du destinataire : un gestionnaire lit toute la cloche', async () => {
      const leaked = await h.withPolicy(
        'notifications',
        'owner_access',
        { using: 'user_id IS NOT NULL', withCheck: 'user_id IS NOT NULL' },
        () => h.as(asManagerOf(A), visible('notifications')),
      );
      expect(leaked).toHaveLength(4);
    });

    it('owner_access de deliveries ne dépend plus du destinataire', async () => {
      const leaked = await h.withPolicy(
        'deliveries',
        'owner_access',
        { using: 'user_id IS NOT NULL', withCheck: 'user_id IS NOT NULL' },
        () => h.as(asSubscriber(USERS.moussa), visible('deliveries')),
      );
      expect(leaked).toHaveLength(2);
    });

    it('owner_access sans WITH CHECK sur le destinataire : on écrirait dans la cloche d’autrui', async () => {
      const written = await h.withPolicy(
        'notifications',
        'owner_access',
        { using: 'user_id = app_user_id()', withCheck: 'true' },
        () =>
          h.asRollback(asSubscriber(USERS.moussa), (tx) =>
            insertNotification(tx, '00000000-0000-7000-8000-0000000e0c02', USERS.fatou, B.id),
          ),
      );
      expect(written.rowCount).toBe(1);
    });

    it('system_access ouverte hors de l’espace system', async () => {
      for (const table of ['notifications', 'deliveries'] as const) {
        const leaked = await h.withPolicy(
          table,
          'system_access',
          { using: "app_space() <> 'none'", withCheck: "app_space() <> 'none'" },
          () => h.as(asSubscriber(USERS.aminata), visible(table)),
        );
        expect(leaked.length).toBeGreaterThan(0);
      }
    });
  });
});
