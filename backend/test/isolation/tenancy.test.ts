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
  pgConstraint,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Isolation des tables tenancy du lot 1.2 (base migrée) : associations (tenant_self, member_read, system_read),
 * association_payment_methods (tenant_isolation, member_read), memberships (tenant_isolation, self_read). La lecture par
 * la personne elle-même (member_read, self_read) n'existe que dans les espaces subscriber et auth : un contexte
 * d'association ou de plateforme ne voit jamais les appartenances d'une personne dans une autre association.
 * Chaque politique est aussi testée affaiblie.
 */

const MEMBERSHIPS = {
  awaOwnerA: '00000000-0000-7000-8000-00000000b001',
  moussaA: '00000000-0000-7000-8000-00000000b002',
  /** Invitée, pas encore active : aucune lecture de l'association. */
  aminataInvitedA: '00000000-0000-7000-8000-00000000b003',
  koffiOwnerB: '00000000-0000-7000-8000-00000000b004',
  fatouB: '00000000-0000-7000-8000-00000000b005',
  awaB: '00000000-0000-7000-8000-00000000b006',
} as const;

const METHODS = {
  orangeA: '00000000-0000-7000-8000-0000000aa001',
  bankB: '00000000-0000-7000-8000-0000000aa002',
} as const;

const ids = (table: string) => (tx: Tx) =>
  tx
    .execute<{ id: string }>(sql`SELECT id FROM ${sql.identifier(table)} ORDER BY id`)
    .then((r) => r.rows.map((row) => row.id));

const associations = ids('associations');
const memberships = ids('memberships');
const methods = ids('association_payment_methods');

const insertMembership = (tx: Tx, id: string, associationId: string, userId: string) =>
  tx.execute(sql`INSERT INTO memberships (id, association_id, user_id, role, status)
                 VALUES (${id}, ${associationId}, ${userId}, 'manager', 'active')`);

const insertMethod = (tx: Tx, id: string, associationId: string) =>
  tx.execute(sql`INSERT INTO association_payment_methods (id, association_id, kind, label)
                 VALUES (${id}, ${associationId}, 'mobile_money', 'Wave')`);

const ALL_ASSOCIATIONS = [A.id, B.id];

describe('isolation : associations, association_payment_methods, memberships (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status) VALUES
         ($1, $7, $9, 'owner', 'active'), ($2, $7, $10, 'subscriber', 'active'),
         ($3, $7, $11, 'subscriber', 'invited'), ($4, $8, $12, 'owner', 'active'),
         ($5, $8, $13, 'subscriber', 'active'), ($6, $8, $9, 'subscriber', 'active')`,
      [
        MEMBERSHIPS.awaOwnerA,
        MEMBERSHIPS.moussaA,
        MEMBERSHIPS.aminataInvitedA,
        MEMBERSHIPS.koffiOwnerB,
        MEMBERSHIPS.fatouB,
        MEMBERSHIPS.awaB,
        A.id,
        B.id,
        USERS.awa,
        USERS.moussa,
        USERS.aminata,
        USERS.koffi,
        USERS.fatou,
      ],
    );
    await h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label) VALUES
         ($1, $3, 'mobile_money', 'Orange Money'), ($2, $4, 'bank_transfer', 'SGBCI')`,
      [METHODS.orangeA, METHODS.bankB, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  /** La politique (lecture par la personne) exige-t-elle l'espace subscriber ou auth, dans sa propre expression ? */
  async function spaceBound(table: string, policy: string): Promise<boolean> {
    const { rows } = await h.migrator(
      `SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 AND policyname = $2`,
      [table, policy],
    );
    const qual = (rows[0] as { qual: string | null } | undefined)?.qual ?? '';
    return qual.includes("app_space() = ANY (ARRAY['subscriber'::text, 'auth'::text])");
  }

  describe('espace association', () => {
    it('chaque gestionnaire ne voit que son association, ses appartenances et ses moyens de paiement', async () => {
      await h.as(asManagerOf(A), async (tx) => {
        expect(await associations(tx)).toEqual([A.id]);
        expect(await memberships(tx)).toEqual([
          MEMBERSHIPS.awaOwnerA,
          MEMBERSHIPS.moussaA,
          MEMBERSHIPS.aminataInvitedA,
        ]);
        expect(await methods(tx)).toEqual([METHODS.orangeA]);
      });
      await h.as(asManagerOf(B), async (tx) => {
        expect(await associations(tx)).toEqual([B.id]);
        expect(await memberships(tx)).toEqual([MEMBERSHIPS.koffiOwnerB, MEMBERSHIPS.fatouB, MEMBERSHIPS.awaB]);
        expect(await methods(tx)).toEqual([METHODS.bankB]);
      });
    });

    it('membre de A et de B, dans le contexte de B : rien de A, pas même sa propre appartenance', async () => {
      await h.as({ space: 'association', associationId: B.id, userId: USERS.awa }, async (tx) => {
        expect(await associations(tx)).toEqual([B.id]);
        expect(await memberships(tx)).not.toContain(MEMBERSHIPS.awaOwnerA);
        expect(await methods(tx)).toEqual([METHODS.bankB]);
      });
    });

    it('un gestionnaire de A ne peut ni ajouter une appartenance ni un moyen de paiement à B', async () => {
      const membership = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          insertMembership(tx, '00000000-0000-7000-8000-00000000b0f1', B.id, USERS.awa),
        ),
      );
      expect(isRlsViolation(membership)).toBe(true);
      const method = await errorOf(
        h.asRollback(asManagerOf(A), (tx) => insertMethod(tx, '00000000-0000-7000-8000-0000000aa0f1', B.id)),
      );
      expect(isRlsViolation(method)).toBe(true);
    });

    it('un gestionnaire de A ne déplace pas une ligne de A vers B', async () => {
      for (const [table, id] of [
        ['memberships', MEMBERSHIPS.moussaA],
        ['association_payment_methods', METHODS.orangeA],
      ] as const) {
        const error = await errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`UPDATE ${sql.identifier(table)} SET association_id = ${B.id} WHERE id = ${id}`),
          ),
        );
        expect({ table, rls: isRlsViolation(error) }).toEqual({ table, rls: true });
      }
    });

    it('un gestionnaire de A ne modifie ni l’association B ni ses lignes', async () => {
      const results = await h.asRollback(asManagerOf(A), async (tx) => [
        (await tx.execute(sql`UPDATE associations SET name = 'piratée' WHERE id = ${B.id}`)).rowCount,
        (await tx.execute(sql`UPDATE memberships SET status = 'removed' WHERE association_id = ${B.id}`)).rowCount,
        (await tx.execute(sql`DELETE FROM association_payment_methods WHERE id = ${METHODS.bankB}`)).rowCount,
      ]);
      expect(results).toEqual([0, 0, 0]);
    });

    it('un gestionnaire ne crée pas d’association et ne change pas l’identifiant de la sienne', async () => {
      const created = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone)
                         VALUES (gen_random_uuid(), 'intruse', 'Intruse', 'entraide', 'Abidjan', 'CI', 'x@x.ci', '+225')`),
        ),
      );
      expect(isRlsViolation(created)).toBe(true);
      const renamed = await errorOf(
        h.asRollback(asManagerOf(A), (tx) =>
          tx.execute(sql`UPDATE associations SET id = gen_random_uuid() WHERE id = ${A.id}`),
        ),
      );
      expect(isRlsViolation(renamed)).toBe(true);
    });
  });

  describe('espaces subscriber et auth (lecture par la personne elle-même)', () => {
    it.each(['subscriber', 'auth'] as const)(
      'en espace %s, un souscripteur voit son association, son appartenance et ses moyens de paiement',
      async (space) => {
        await h.as({ space, userId: USERS.moussa }, async (tx) => {
          expect(await associations(tx)).toEqual([A.id]);
          expect(await memberships(tx)).toEqual([MEMBERSHIPS.moussaA]);
          expect(await methods(tx)).toEqual([METHODS.orangeA]);
        });
      },
    );

    it('membre actif de deux associations : les deux, et ses deux appartenances', async () => {
      await h.as(asSubscriber(USERS.awa), async (tx) => {
        expect(await associations(tx)).toEqual(ALL_ASSOCIATIONS);
        expect(await memberships(tx)).toEqual([MEMBERSHIPS.awaOwnerA, MEMBERSHIPS.awaB]);
        expect(await methods(tx)).toEqual([METHODS.orangeA, METHODS.bankB]);
      });
    });

    it('appartenance seulement invitée : elle-même, mais ni l’association ni ses moyens de paiement', async () => {
      await h.as(asSubscriber(USERS.aminata), async (tx) => {
        expect(await associations(tx)).toEqual([]);
        expect(await memberships(tx)).toEqual([MEMBERSHIPS.aminataInvitedA]);
        expect(await methods(tx)).toEqual([]);
      });
    });

    it('appartenance retirée : plus de lecture de l’association', async () => {
      await h.superuser(`UPDATE memberships SET status = 'removed' WHERE id = $1`, [MEMBERSHIPS.fatouB]);
      try {
        expect(await h.as(asSubscriber(USERS.fatou), associations)).toEqual([]);
        expect(await h.as(asSubscriber(USERS.fatou), methods)).toEqual([]);
      } finally {
        await h.superuser(`UPDATE memberships SET status = 'active' WHERE id = $1`, [MEMBERSHIPS.fatouB]);
      }
    });

    it('un souscripteur n’écrit rien : ni appartenance, ni moyen de paiement, ni association', async () => {
      const membership = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertMembership(tx, '00000000-0000-7000-8000-00000000b0f2', A.id, USERS.moussa),
        ),
      );
      expect(isRlsViolation(membership)).toBe(true);
      const method = await errorOf(
        h.asRollback(asSubscriber(USERS.moussa), (tx) =>
          insertMethod(tx, '00000000-0000-7000-8000-0000000aa0f2', A.id),
        ),
      );
      expect(isRlsViolation(method)).toBe(true);
      const updated = await h.asRollback(asSubscriber(USERS.moussa), async (tx) => [
        (await tx.execute(sql`UPDATE associations SET name = 'x' WHERE id = ${A.id}`)).rowCount,
        (await tx.execute(sql`UPDATE memberships SET role = 'owner' WHERE id = ${MEMBERSHIPS.moussaA}`)).rowCount,
      ]);
      expect(updated).toEqual([0, 0]);
    });
  });

  describe('autres espaces', () => {
    it.each([
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['public', { space: 'public' }],
      // Avant authentification (connexion, réinitialisation, CLI) : aucune personne, donc rien.
      ['auth sans personne', { space: 'auth' }],
    ] as const)('espace %s : rien, même pour un membre', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await associations(tx)).toEqual([]);
        expect(await memberships(tx)).toEqual([]);
        expect(await methods(tx)).toEqual([]);
      });
    });

    it('sans contexte, ou sans aucune variable app.* : rien', async () => {
      for (const table of ['associations', 'memberships', 'association_payment_methods']) {
        expect({ table, n: await h.count(null, table) }).toEqual({ table, n: 0 });
        expect({ table, n: await h.countWithoutTenantDatabase(table) }).toEqual({ table, n: 0 });
      }
    });

    it('espace system (worker) : toutes les associations en lecture, aucune appartenance', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        const read = async (table: string) =>
          (await client.query<{ id: string }>(`SELECT id FROM ${table} ORDER BY id`)).rows.map((r) => r.id);
        return { associations: await read('associations'), memberships: await read('memberships') };
      });
      expect(seen).toEqual({ associations: ALL_ASSOCIATIONS, memberships: [] });
    });
  });

  describe('invariants', () => {
    it('une personne n’a qu’une appartenance par association et par rôle', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            `INSERT INTO memberships (id, association_id, user_id, role) VALUES (gen_random_uuid(), $1, $2, 'subscriber')`,
            [A.id, USERS.moussa],
          ),
        ),
      );
      expect(pgCode(error)).toBe('23505');
      expect(pgConstraint(error)).toBe('memberships_association_id_user_id_role_key');
    });

    it.each([
      [
        'memberships',
        `INSERT INTO memberships (id, association_id, user_id, role) VALUES (gen_random_uuid(), $1, $2, 'viewer')`,
      ],
      [
        'association_payment_methods',
        `INSERT INTO association_payment_methods (id, association_id, kind, label)
         VALUES (gen_random_uuid(), $1, 'cash', $2::text)`,
      ],
      [
        'one_time_codes',
        `INSERT INTO one_time_codes (id, user_id, association_id, purpose, code_hash, expires_at)
         VALUES (gen_random_uuid(), $2, $1, 'activation', 'h', now() + interval '1 day')`,
      ],
      [
        'files',
        `INSERT INTO files (id, association_id, owner_user_id, purpose, bucket, object_key, original_name, mime_type,
                            size_bytes)
         VALUES (gen_random_uuid(), $1, $2, 'logo', 'cotiz-media', 'k', 'a.png', 'image/png', 1)`,
      ],
      [
        'password_reset_requests',
        `INSERT INTO password_reset_requests (id, user_id, association_id, space)
         VALUES (gen_random_uuid(), $2, $1, 'subscriber')`,
      ],
    ])('%s.association_id référence une association existante', async (_table, insert) => {
      const unknown = '00000000-0000-7000-8000-00000000a999';
      const error = await h.superuserRollback((client) => errorOf(client.query(insert, [unknown, USERS.moussa])));
      expect(pgCode(error)).toBe('23503');
    });

    it('associations.logo_file_id référence un fichier existant', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(`UPDATE associations SET logo_file_id = '00000000-0000-7000-8000-0000000f0999' WHERE id = $1`, [
            A.id,
          ]),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('updated_at est rafraîchi à chaque modification d’une association (associations_touch)', async () => {
      const touched = await h.superuserRollback(async (client) => {
        await client.query(`UPDATE associations SET updated_at = '2000-01-01' WHERE id = $1`, [A.id]);
        const { rows } = await client.query<{ recent: boolean }>(
          `SELECT updated_at > now() - interval '1 minute' AS recent FROM associations WHERE id = $1`,
          [A.id],
        );
        return rows[0]?.recent;
      });
      expect(touched).toBe(true);
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    it.each([
      ['memberships', 'tenant_isolation', memberships, 6],
      ['association_payment_methods', 'tenant_isolation', methods, 2],
      ['associations', 'tenant_self', associations, 2],
    ] as const)('%s.%s élargie : le gestionnaire de A voit B', async (table, policy, read, leaked) => {
      const seen = await h.withPolicy(table, policy, { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), read),
      );
      expect(seen).toHaveLength(leaked);
    });

    it.each([
      ['memberships', 'tenant_isolation', memberships],
      ['association_payment_methods', 'tenant_isolation', methods],
      ['associations', 'tenant_self', associations],
    ] as const)('%s.%s retirée : le gestionnaire ne voit plus rien des siennes', async (table, policy, read) => {
      expect(await h.withoutPolicy(table, policy, () => h.as(asManagerOf(A), read))).toEqual([]);
    });

    it('associations.tenant_self en WITH CHECK (true) : un gestionnaire crée une association', async () => {
      const weakened = { using: 'id = app_association_id()', withCheck: 'true' };
      const error = await h.withPolicy('associations', 'tenant_self', weakened, () =>
        errorOf(
          h.asRollback(asManagerOf(A), (tx) =>
            tx.execute(sql`INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone)
                           VALUES (gen_random_uuid(), 'intruse', 'Intruse', 'entraide', 'Abidjan', 'CI', 'x@x.ci', '+225')`),
          ),
        ),
      );
      expect(error).toBeNull();
    });

    it('memberships.self_read sans condition d’espace : l’appartenance à A fuit dans le contexte de B', async () => {
      const seen = await h.withPolicy(
        'memberships',
        'self_read',
        { using: 'user_id = app_user_id()', withCheck: null },
        () => h.as({ space: 'association', associationId: B.id, userId: USERS.awa }, memberships),
      );
      expect(seen).toContain(MEMBERSHIPS.awaOwnerA);
    });

    it('memberships.self_read sans condition de personne : un souscripteur voit les appartenances des autres', async () => {
      const seen = await h.withPolicy(
        'memberships',
        'self_read',
        { using: "app_space() IN ('subscriber', 'auth')", withCheck: null },
        () => h.as(asSubscriber(USERS.moussa), memberships),
      );
      expect(seen).toHaveLength(6);
    });

    it('memberships.self_read retirée : le souscripteur ne voit plus son association (member_read en dépend)', async () => {
      await h.withoutPolicy('memberships', 'self_read', async () => {
        expect(await h.as(asSubscriber(USERS.moussa), memberships)).toEqual([]);
        expect(await h.as(asSubscriber(USERS.moussa), associations)).toEqual([]);
      });
    });

    // member_read sans condition d'espace ne fuit pas seule : sa sous-requête lit memberships, que self_read borne
    // déjà aux espaces subscriber et auth. La condition reste exigée sur chaque politique (test de structure
    // ci-dessous) : une future politique plus large sur memberships ouvrirait sinon associations et moyens de paiement.
    it.each([
      ['memberships', 'self_read'],
      ['associations', 'member_read'],
      ['association_payment_methods', 'member_read'],
    ] as const)('%s.%s porte elle-même la condition d’espace (subscriber, auth)', async (table, policy) => {
      expect(await spaceBound(table, policy)).toBe(true);
    });

    it('le test de structure échoue si member_read perd sa condition d’espace', async () => {
      const widened = {
        using: `EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = associations.id AND m.user_id = app_user_id() AND m.status = 'active')`,
        withCheck: null,
      };
      expect(
        await h.withPolicy('associations', 'member_read', widened, () => spaceBound('associations', 'member_read')),
      ).toBe(false);
    });

    it.each([
      ['associations', associations, 'associations.id'],
      ['association_payment_methods', methods, 'association_payment_methods.association_id'],
    ] as const)(
      '%s.member_read et memberships.self_read sans condition d’espace : visible depuis la plateforme',
      async (table, read, column) => {
        const widened = {
          using: `EXISTS (SELECT 1 FROM memberships m WHERE m.association_id = ${column} AND m.user_id = app_user_id() AND m.status = 'active')`,
          withCheck: null,
        };
        // La plateforme ne lit pas memberships ; on ouvre aussi self_read pour que member_read puisse s'appliquer.
        const seen = await h.withPolicy(
          'memberships',
          'self_read',
          { using: 'user_id = app_user_id()', withCheck: null },
          () => h.withPolicy(table, 'member_read', widened, () => h.as({ space: 'platform', userId: USERS.awa }, read)),
        );
        expect(seen).toHaveLength(2);
      },
    );

    it.each([
      ['associations', associations],
      ['association_payment_methods', methods],
    ] as const)(
      '%s.member_read sans condition d’appartenance active : l’invitée voit l’association',
      async (table, read) => {
        const widened = { using: "app_space() IN ('subscriber', 'auth')", withCheck: null };
        const seen = await h.withPolicy(table, 'member_read', widened, () => h.as(asSubscriber(USERS.aminata), read));
        expect(seen).toHaveLength(2);
      },
    );

    it('associations.member_read retirée : le souscripteur ne voit plus son association', async () => {
      expect(
        await h.withoutPolicy('associations', 'member_read', () => h.as(asSubscriber(USERS.moussa), associations)),
      ).toEqual([]);
    });

    it('associations.system_read ouverte hors du worker : détecté', async () => {
      const seen = await h.withPolicy(
        'associations',
        'system_read',
        { using: "app_space() <> 'none'", withCheck: null },
        () => h.as(asSubscriber(USERS.fatou), associations),
      );
      expect(seen).toEqual(ALL_ASSOCIATIONS);
    });
  });
});
