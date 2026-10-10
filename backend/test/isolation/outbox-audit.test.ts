import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  type IsolationHarness,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des tables du lot 0.5 (base migrée) :
 * - outbox_events : ajout depuis tout contexte, lecture et modification par le relais (espace system) seulement ;
 * - audit_logs : ajout depuis tout contexte, lecture par l'association concernée (et le système) seulement.
 * L'espace system est réservé au worker : il est couvert par test/integration/outbox.test.ts.
 */

const FILE = '00000000-0000-7000-8000-0000000f0001';

/** Contextes d'une requête HTTP qui ne doivent rien lire de l'outbox. */
const REQUEST_CONTEXTS = [
  ['gestionnaire de A', asManagerOf(A)],
  ['gestionnaire de B', asManagerOf(B)],
  ['souscripteur Moussa', asSubscriber(USERS.moussa)],
  ['espace platform', { space: 'platform', userId: USERS.awa }],
  ['espace auth', { space: 'auth', userId: USERS.awa }],
] as const;

const insertOutbox = (tx: Tx, associationId: string | null) =>
  tx.execute(sql`INSERT INTO outbox_events (association_id, event_type, aggregate_type, aggregate_id, payload)
                 VALUES (${associationId}, 'file.uploaded', 'file', ${FILE}, '{}')`);

const outboxIds = (tx: Tx) =>
  tx.execute<{ id: string }>(sql`SELECT id::text AS id FROM outbox_events`).then((r) => r.rows.map((x) => x.id));

const auditActions = (tx: Tx) =>
  tx.execute<{ action: string }>(sql`SELECT action FROM audit_logs`).then((r) => r.rows.map((x) => x.action).sort());

describe('isolation : outbox_events et audit_logs (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await h.superuser(
      `INSERT INTO outbox_events (association_id, event_type, aggregate_type, aggregate_id)
       VALUES ($1, 'file.uploaded', 'file', $3), ($2, 'file.uploaded', 'file', $3), (NULL, 'plan.updated', 'plan', $3)`,
      [A.id, B.id, FILE],
    );
    await h.superuser(
      `INSERT INTO audit_logs (association_id, actor_user_id, actor_role, action, entity_type)
       VALUES ($1, $3, 'owner', 'a.action', 'x'), ($2, $4, 'owner', 'b.action', 'x'),
              (NULL, NULL, 'platform_owner', 'platform.action', 'x')`,
      [A.id, B.id, USERS.awa, USERS.koffi],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('outbox_events', () => {
    it.each(REQUEST_CONTEXTS)('%s : ajoute un événement, ne relit rien', async (_who, context) => {
      const seen = await h.asRollback(context, async (tx) => {
        await insertOutbox(tx, 'associationId' in context ? (context.associationId ?? null) : null);
        return outboxIds(tx);
      });
      expect(seen).toEqual([]);
    });

    it('sans contexte : ajout possible, aucune lecture', async () => {
      expect(
        await h.withoutContext(async (tx) => {
          await insertOutbox(tx, null);
          return outboxIds(tx);
        }),
      ).toEqual([]);
      await h.superuser('DELETE FROM outbox_events WHERE association_id IS NULL AND event_type = $1', [
        'file.uploaded',
      ]);
      expect(await h.count(null, 'outbox_events')).toBe(0);
      expect(await h.countWithoutTenantDatabase('outbox_events')).toBe(0);
    });

    it('aucun contexte de requête ne publie ni ne supprime un événement', async () => {
      for (const [, context] of REQUEST_CONTEXTS) {
        const touched = await h.asRollback(context, async (tx) => {
          const updated = await tx.execute(sql`UPDATE outbox_events SET published_at = now()`);
          const deleted = await tx.execute(sql`DELETE FROM outbox_events`);
          return (updated.rowCount ?? 0) + (deleted.rowCount ?? 0);
        });
        expect(touched).toBe(0);
      }
      const { rows } = await h.superuser('SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL');
      expect(rows[0]).toEqual({ n: 3 });
    });

    it('la base accepte un événement pour une autre association : la garde est applicative (OutboxService)', async () => {
      const seen = await h.asRollback(asManagerOf(A), async (tx) => {
        await insertOutbox(tx, B.id);
        return 'inséré';
      });
      expect(seen).toBe('inséré');
    });

    it('le test échoue si la politique relay s’ouvre au-delà de l’espace system', async () => {
      const leaked = await h.withPolicy('outbox_events', 'relay', { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), outboxIds),
      );
      expect(leaked).toHaveLength(3);
    });

    it('le test échoue si la RLS est désactivée', async () => {
      expect(await h.withRlsDisabled('outbox_events', () => h.count(asManagerOf(A), 'outbox_events'))).toBe(3);
    });
  });

  describe('audit_logs', () => {
    it('chaque association ne lit que son journal', async () => {
      expect(await h.as(asManagerOf(A), auditActions)).toEqual(['a.action']);
      expect(await h.as(asManagerOf(B), auditActions)).toEqual(['b.action']);
    });

    it('ni un souscripteur, ni un autre espace, ni l’absence de contexte ne lisent le journal', async () => {
      expect(await h.as(asSubscriber(USERS.awa), auditActions)).toEqual([]);
      expect(await h.as({ space: 'platform', userId: USERS.awa }, auditActions)).toEqual([]);
      expect(await h.withoutContext(auditActions)).toEqual([]);
      expect(await h.countWithoutTenantDatabase('audit_logs')).toBe(0);
    });

    it('chaque contexte peut ajouter une entrée, y compris pour sa propre association', async () => {
      const seen = await h.asRollback(asManagerOf(A), async (tx) => {
        await tx.execute(sql`INSERT INTO audit_logs (association_id, actor_user_id, actor_role, action, entity_type)
                             VALUES (${A.id}, ${USERS.awa}, 'owner', 'a.second', 'x')`);
        return auditActions(tx);
      });
      expect(seen).toEqual(['a.action', 'a.second']);
    });

    it('le test échoue si tenant_read s’élargit', async () => {
      const leaked = await h.withPolicy('audit_logs', 'tenant_read', { using: 'true', withCheck: null }, () =>
        h.as(asManagerOf(A), auditActions),
      );
      expect(leaked).toEqual(['a.action', 'b.action', 'platform.action']);
    });

    it('le test échoue si system_read ne dépend plus de l’espace', async () => {
      const leaked = await h.withPolicy(
        'audit_logs',
        'system_read',
        { using: "app_space() <> 'none'", withCheck: null },
        () => h.as(asSubscriber(USERS.awa), auditActions),
      );
      expect(leaked).toHaveLength(3);
    });
  });
});
