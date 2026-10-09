import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  A,
  asManagerOf,
  asSubscriber,
  B,
  createTenantTable,
  errorOf,
  type IsolationHarness,
  isRlsViolation,
  SEEDED_LABELS,
  seedTwoAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Harnais d'isolation sur la base migrée : une table d'association créée comme dans une migration (enableTenantRls()
 * et politique souscripteur), deux associations A et B. Modèle des tests d'isolation des lots métier.
 */
const TABLE = 'isolation_items';

const read = (tx: Tx) =>
  tx
    .execute<{ label: string }>(sql`SELECT label FROM isolation_items`)
    .then((r) => r.rows.map((row) => row.label).sort());

/** Contrôles d'isolation : lève une erreur à la première fuite ou au premier manque, avec les lignes vues. */
async function checkIsolation(h: IsolationHarness): Promise<void> {
  const expectLabels = (actual: string[], expected: readonly string[], who: string) => {
    if (actual.join() !== expected.join()) {
      throw new Error(`fuite ou manque (${who}) : ${JSON.stringify(actual)} au lieu de ${JSON.stringify(expected)}`);
    }
  };

  expectLabels(await h.as(asManagerOf(A), read), SEEDED_LABELS.A, 'gestionnaire de A');
  expectLabels(await h.as(asManagerOf(B), read), SEEDED_LABELS.B, 'gestionnaire de B');
  expectLabels(await h.as(asSubscriber(USERS.moussa), read), SEEDED_LABELS.moussa, 'souscripteur Moussa');
  expectLabels(await h.as(asSubscriber(USERS.fatou), read), SEEDED_LABELS.fatou, 'souscriptrice Fatou');
  expectLabels(await h.as(asSubscriber(USERS.awa), read), SEEDED_LABELS.awa, 'souscriptrice Awa');
  expectLabels(await h.withoutContext(read), [], 'sans contexte');
  // Hors de l'espace subscriber, l'utilisateur ne lit pas ses lignes de souscripteur.
  for (const space of ['auth', 'public', 'platform'] as const) {
    expectLabels(await h.as({ space, userId: USERS.moussa }, read), [], `espace ${space}`);
  }
}

describe('harnais d’isolation (base migrée, table créée avec enableTenantRls)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await createTenantTable(h, TABLE);
    await seedTwoAssociations(h, TABLE);
  });

  afterAll(async () => {
    await h.stop();
  });

  it('asManagerOf() et asSubscriber() posent le contexte attendu par les politiques', async () => {
    const context = (tx: Tx) =>
      tx
        .execute<{ aid: string | null; uid: string | null; space: string }>(
          sql`SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space`,
        )
        .then((r) => r.rows[0]);
    expect(await h.as(asManagerOf(B), context)).toEqual({ aid: B.id, uid: B.managerId, space: 'association' });
    expect(await h.as(asSubscriber(USERS.fatou), context)).toEqual({
      aid: null,
      uid: USERS.fatou,
      space: 'subscriber',
    });
    expect(await h.withoutContext(context)).toEqual({ aid: null, uid: null, space: 'none' });
  });

  it('chacun ne voit que ses lignes ; sans contexte, aucune', async () => {
    await expect(checkIsolation(h)).resolves.toBeUndefined();
  });

  it('une connexion cotiz_app qui ne pose aucune variable app.* ne voit rien', async () => {
    expect(await h.countWithoutTenantDatabase(TABLE)).toBe(0);
  });

  it('un gestionnaire écrit dans son association (témoin des refus ci-dessous)', async () => {
    const result = await h.asRollback(asManagerOf(B), async (tx) => {
      const inserted = await tx.execute(sql`INSERT INTO isolation_items (association_id, label) VALUES (${B.id}, 'x')`);
      const updated = await tx.execute(sql`UPDATE isolation_items SET label = label || '!' WHERE label = 'b-gestion'`);
      const deleted = await tx.execute(sql`DELETE FROM isolation_items WHERE label = 'b-fatou'`);
      return [inserted.rowCount, updated.rowCount, deleted.rowCount];
    });
    expect(result).toEqual([1, 1, 1]);
    await expect(checkIsolation(h)).resolves.toBeUndefined();
  });

  it('un gestionnaire de B ne peut pas écrire chez A (refus de la RLS, pas d’un droit)', async () => {
    const error = await errorOf(
      h.asRollback(asManagerOf(B), (tx) =>
        tx.execute(sql`INSERT INTO isolation_items (association_id, label) VALUES (${A.id}, 'intrus')`),
      ),
    );
    expect(isRlsViolation(error)).toBe(true);
  });

  it('un gestionnaire de B ne peut ni modifier, ni supprimer, ni déplacer les lignes de A', async () => {
    const affected = await h.asRollback(asManagerOf(B), async (tx) => {
      const updated = await tx.execute(sql`UPDATE isolation_items SET label = 'pris' WHERE association_id = ${A.id}`);
      const deleted = await tx.execute(sql`DELETE FROM isolation_items WHERE association_id = ${A.id}`);
      return [updated.rowCount, deleted.rowCount];
    });
    expect(affected).toEqual([0, 0]);
    // Déplacer une ligne de B vers A : refusé par WITH CHECK.
    const moved = await errorOf(
      h.asRollback(asManagerOf(B), (tx) => tx.execute(sql`UPDATE isolation_items SET association_id = ${A.id}`)),
    );
    expect(isRlsViolation(moved)).toBe(true);
    await expect(checkIsolation(h)).resolves.toBeUndefined();
  });

  it('un souscripteur ne peut rien écrire par la politique de lecture', async () => {
    const error = await errorOf(
      h.asRollback(asSubscriber(USERS.moussa), (tx) =>
        tx.execute(
          sql`INSERT INTO isolation_items (association_id, user_id, label) VALUES (${A.id}, ${USERS.moussa}, 'x')`,
        ),
      ),
    );
    expect(isRlsViolation(error)).toBe(true);
  });

  // « Retirer une politique la fait échouer » : manque (politique retirée) et fuite (politique élargie, RLS coupée).
  describe('la suite échoue si l’isolation est affaiblie', () => {
    const TENANT = 'association_id = app_association_id()';

    it('tenant_isolation retirée : les gestionnaires ne voient plus leurs lignes', async () => {
      await h.withoutPolicy(TABLE, 'tenant_isolation', () =>
        expect(checkIsolation(h)).rejects.toThrow(/\(gestionnaire de A\) : \[\]/),
      );
    });

    it('subscriber_self_read retirée : le souscripteur ne voit plus ses lignes', async () => {
      await h.withoutPolicy(TABLE, 'subscriber_self_read', () =>
        expect(checkIsolation(h)).rejects.toThrow(/\(souscripteur Moussa\) : \[\]/),
      );
    });

    it('tenant_isolation en USING (true) : fuite entre associations', async () => {
      await h.withPolicy(TABLE, 'tenant_isolation', { using: 'true', withCheck: TENANT }, () =>
        expect(checkIsolation(h)).rejects.toThrow(/\(gestionnaire de A\) : .*"b-/),
      );
    });

    it('tenant_isolation en WITH CHECK (true) : l’écriture chez A passe, le contrôle ci-dessus échouerait', async () => {
      await h.withPolicy(TABLE, 'tenant_isolation', { using: TENANT, withCheck: 'true' }, async () => {
        const error = await errorOf(
          h.asRollback(asManagerOf(B), (tx) =>
            tx.execute(sql`INSERT INTO isolation_items (association_id, label) VALUES (${A.id}, 'intrus')`),
          ),
        );
        expect(error).toBeNull();
      });
    });

    it('subscriber_self_read sans condition d’espace : le gestionnaire de A voit ses lignes de souscriptrice de B', async () => {
      await h.withPolicy(TABLE, 'subscriber_self_read', { using: 'user_id = app_user_id()', withCheck: null }, () =>
        expect(checkIsolation(h)).rejects.toThrow(/\(gestionnaire de A\) : .*"b-awa"/),
      );
    });

    it('RLS désactivée : fuite entre associations', async () => {
      await h.withRlsDisabled(TABLE, () => expect(checkIsolation(h)).rejects.toThrow(/\(gestionnaire de A\) : .*"b-/));
    });

    it('chaque essai rétablit politiques et RLS à l’identique', async () => {
      const before = await h.securityOf(TABLE);
      expect(before).toMatchObject({ rls: true, forced: true });
      await h.withoutPolicy(TABLE, 'tenant_isolation', () => Promise.resolve());
      await h.withPolicy(TABLE, 'subscriber_self_read', { using: 'true', withCheck: null }, () => Promise.resolve());
      await h.withRlsDisabled(TABLE, () => Promise.resolve());
      expect(await h.securityOf(TABLE)).toEqual(before);
      await expect(checkIsolation(h)).resolves.toBeUndefined();
    });
  });
});
