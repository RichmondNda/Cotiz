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
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des tables à RLS du module identity (base migrée) : one_time_codes et password_reset_requests.
 * - tenant_manage : l'association qui a émis le code ou qui traite la demande ;
 * - auth_access : le module identity avant authentification (espace auth) et le worker (system).
 * Aucune autre lecture : ni la personne concernée dans son espace, ni l'espace platform (qui passera par
 * cotiz_platform, lot 1.4), ni une requête sans contexte. Chaque politique est aussi testée affaiblie.
 * L'espace system est réservé au worker (le harnais ne peut pas le poser) : son accès est couvert par le test
 * d'intégration de la tâche codes.expire (étape 9 du lot).
 */

const IDS = {
  codeA: '00000000-0000-7000-8000-0000000c0a01',
  codeB: '00000000-0000-7000-8000-0000000c0b01',
  codePlatform: '00000000-0000-7000-8000-0000000c0c01',
  resetA: '00000000-0000-7000-8000-0000000d0a01',
  resetB: '00000000-0000-7000-8000-0000000d0b01',
  resetPlatform: '00000000-0000-7000-8000-0000000d0c01',
  fresh: '00000000-0000-7000-8000-0000000e0001',
} as const;

interface TableCase {
  table: 'one_time_codes' | 'password_reset_requests';
  rows: { a: string; b: string; platform: string };
  insert: (tx: Tx, id: string, associationId: string | null, userId: string) => Promise<unknown>;
}

const CASES: TableCase[] = [
  {
    table: 'one_time_codes',
    rows: { a: IDS.codeA, b: IDS.codeB, platform: IDS.codePlatform },
    insert: (tx, id, associationId, userId) =>
      tx.execute(sql`INSERT INTO one_time_codes (id, user_id, purpose, code_hash, expires_at, association_id)
                     VALUES (${id}, ${userId}, 'activation', 'h', now() + interval '72 hours', ${associationId})`),
  },
  {
    table: 'password_reset_requests',
    rows: { a: IDS.resetA, b: IDS.resetB, platform: IDS.resetPlatform },
    insert: (tx, id, associationId, userId) =>
      tx.execute(sql`INSERT INTO password_reset_requests (id, user_id, association_id, space)
                     VALUES (${id}, ${userId}, ${associationId}, ${associationId ? 'subscriber' : 'association'})`),
  },
];

describe('isolation : one_time_codes et password_reset_requests (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    // Codes d'activation émis par A (Moussa), par B (Fatou) et par la plateforme (Koffi, gestionnaire approuvé).
    await h.superuser(
      `INSERT INTO one_time_codes (id, user_id, purpose, code_hash, expires_at, association_id, issued_by)
       VALUES ($1, $4, 'activation', 'h', now() + interval '72 hours', $7, $9),
              ($2, $5, 'activation', 'h', now() + interval '72 hours', $8, $6),
              ($3, $6, 'activation', 'h', now() + interval '72 hours', NULL, NULL)`,
      [IDS.codeA, IDS.codeB, IDS.codePlatform, USERS.moussa, USERS.fatou, USERS.koffi, A.id, B.id, USERS.awa],
    );
    // Demandes : Moussa (traitée par A), Fatou (par B), Koffi gestionnaire (par la plateforme).
    await h.superuser(
      `INSERT INTO password_reset_requests (id, user_id, association_id, space)
       VALUES ($1, $4, $7, 'subscriber'), ($2, $5, $8, 'subscriber'), ($3, $6, NULL, 'association')`,
      [IDS.resetA, IDS.resetB, IDS.resetPlatform, USERS.moussa, USERS.fatou, USERS.koffi, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe.each(CASES)('$table', ({ table, rows, insert }) => {
    const visible = (tx: Tx) =>
      tx
        .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
        .then((r) => r.rows.map((row) => row.id));

    it('chaque association ne voit que ses lignes, jamais celles de la plateforme', async () => {
      expect(await h.as(asManagerOf(A), visible)).toEqual([rows.a]);
      expect(await h.as(asManagerOf(B), visible)).toEqual([rows.b]);
    });

    it('la personne concernée, dans son espace souscripteur ou plateforme, ne voit rien', async () => {
      expect(await h.as(asSubscriber(USERS.moussa), visible)).toEqual([]);
      expect(await h.as({ space: 'platform', userId: USERS.koffi }, visible)).toEqual([]);
    });

    it('sans contexte, en espace public ou sur une connexion brute : rien', async () => {
      expect(await h.withoutContext(visible)).toEqual([]);
      expect(await h.as({ space: 'public' }, visible)).toEqual([]);
      expect(await h.countWithoutTenantDatabase(table)).toBe(0);
    });

    it('le module identity (espace auth) voit toutes les lignes', async () => {
      expect(await h.as({ space: 'auth' }, visible)).toEqual([rows.a, rows.b, rows.platform].sort());
    });

    it('le module identity (espace auth) crée une ligne de la plateforme et la relit', async () => {
      const seen = await h.asRollback({ space: 'auth' }, async (tx) => {
        await insert(tx, IDS.fresh, null, USERS.aminata);
        return visible(tx);
      });
      expect(seen).toContain(IDS.fresh);
    });

    it('un gestionnaire de A ne crée pas de ligne pour B ni pour la plateforme', async () => {
      for (const target of [B.id, null]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => insert(tx, IDS.fresh, target, USERS.moussa)));
        expect(isRlsViolation(error)).toBe(true);
      }
    });

    it('un gestionnaire de A ne déplace pas sa ligne vers B', async () => {
      const error = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`UPDATE ${sql.identifier(table)} SET association_id = ${B.id} WHERE id = ${rows.a}`),
        ),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('un gestionnaire de A ne modifie ni ne supprime une ligne de B', async () => {
      const updated = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`UPDATE ${sql.identifier(table)} SET created_at = now() WHERE id = ${rows.b}`),
      );
      expect(updated.rowCount).toBe(0);
      const deleted = await h.asRollback(asManagerOf(A), (tx) =>
        tx.execute(sql`DELETE FROM ${sql.identifier(table)} WHERE id = ${rows.b}`),
      );
      expect(deleted.rowCount).toBe(0);
    });

    it('un souscripteur ne crée pas de ligne, même à son nom', async () => {
      const error = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) => insert(tx, IDS.fresh, null, USERS.moussa)),
      );
      expect(isRlsViolation(error)).toBe(true);
    });

    it('le test échoue si tenant_manage s’élargit', async () => {
      const leaked = await h.withPolicy(table, 'tenant_manage', { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), visible),
      );
      expect(leaked).toHaveLength(3);
    });

    it('le test échoue si auth_access ne dépend plus de l’espace', async () => {
      const leaked = await h.withPolicy(
        table,
        'auth_access',
        { using: "app_space() <> 'none'", withCheck: "app_space() <> 'none'" },
        () => h.as(asSubscriber(USERS.moussa), visible),
      );
      expect(leaked).toHaveLength(3);
    });
  });
});
