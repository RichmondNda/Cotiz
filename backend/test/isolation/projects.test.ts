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
import { paymentMethodsInUse, platformProjectCountsOf } from '../../src/modules/projects/projects.public.js';

/**
 * Isolation des tables du module projects (lot 2.2, base migrée) : projects (tenant_isolation, system_access) et
 * project_payment_methods (tenant_isolation). Les lectures souscripteur (subscriber_enrolled_read, lot 2.3) sont testées
 * avec les inscriptions dans enrollments.test.ts : ici, personne n'est inscrit. Chaque politique est aussi testée
 * affaiblie.
 */

const PROJECTS = {
  a: '00000000-0000-7000-8000-00000000c101',
  b: '00000000-0000-7000-8000-00000000c102',
} as const;

const METHODS = {
  orangeA: '00000000-0000-7000-8000-0000000aa101',
  bankB: '00000000-0000-7000-8000-0000000aa102',
  /** Moyen de B retenu par aucun projet. */
  cashB: '00000000-0000-7000-8000-0000000aa103',
} as const;

/** Lien valide de B, absent du jeu de données : l'écriture qu'un gestionnaire de A tente dans B. */
const insertLinkInB = (tx: Tx) =>
  tx.execute(sql`INSERT INTO project_payment_methods (project_id, payment_method_id, association_id)
                 VALUES (${PROJECTS.b}, ${METHODS.cashB}, ${B.id})`);

const projectIds = (tx: Tx) =>
  tx.execute<{ id: string }>(sql`SELECT id FROM projects ORDER BY id`).then((r) => r.rows.map((row) => row.id));

const linkedProjects = (tx: Tx) =>
  tx
    .execute<{ project_id: string }>(sql`SELECT project_id FROM project_payment_methods ORDER BY project_id`)
    .then((r) => r.rows.map((row) => row.project_id));

const insertProject = (tx: Tx, id: string, associationId: string) =>
  tx.execute(sql`INSERT INTO projects (id, association_id, name, description, installment_amount, frequency, due_day,
                                       schedule_type, start_date, created_by)
                 VALUES (${id}, ${associationId}, 'Intrus', '', 1000, 'monthly', 5, 'rolling', '2026-01-01',
                         ${USERS.awa})`);

const PROJECT_INSERT = `INSERT INTO projects (id, association_id, name, description, installment_amount, frequency,
                                              due_day, schedule_type, start_date, end_date, created_by)
                        VALUES ($1, $2, $3, '', 25000, 'monthly', 5, 'fixed', '2026-03-01', '2027-08-31', $4)`;

describe('isolation : projects, project_payment_methods (base migrée)', () => {
  let h: IsolationHarness;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(PROJECT_INSERT, [PROJECTS.a, A.id, 'Tontine A', USERS.awa]);
    await h.superuser(PROJECT_INSERT, [PROJECTS.b, B.id, 'Tontine B', USERS.koffi]);
    await h.superuser(
      `INSERT INTO association_payment_methods (id, association_id, kind, label) VALUES
         ($1, $3, 'mobile_money', 'Orange Money'), ($2, $4, 'bank_transfer', 'SGBCI'), ($5, $4, 'cash', 'Espèces')`,
      [METHODS.orangeA, METHODS.bankB, A.id, B.id, METHODS.cashB],
    );
    await h.superuser(
      `INSERT INTO project_payment_methods (project_id, payment_method_id, association_id) VALUES
         ($1, $3, $5), ($2, $4, $6)`,
      [PROJECTS.a, PROJECTS.b, METHODS.orangeA, METHODS.bankB, A.id, B.id],
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  describe('espace association', () => {
    it('chaque gestionnaire ne voit que ses projets et leurs moyens de paiement', async () => {
      await h.as(asManagerOf(A), async (tx) => {
        expect(await projectIds(tx)).toEqual([PROJECTS.a]);
        expect(await linkedProjects(tx)).toEqual([PROJECTS.a]);
      });
      await h.as(asManagerOf(B), async (tx) => {
        expect(await projectIds(tx)).toEqual([PROJECTS.b]);
        expect(await linkedProjects(tx)).toEqual([PROJECTS.b]);
      });
    });

    it('un gestionnaire de A ne crée ni projet ni moyen de projet dans B', async () => {
      const project = await errorOf(
        h.asRollback(asManagerOf(A), (tx) => insertProject(tx, '00000000-0000-7000-8000-00000000c1f1', B.id)),
      );
      expect(isRlsViolation(project)).toBe(true);
      const link = await errorOf(h.asRollback(asManagerOf(A), insertLinkInB));
      expect(isRlsViolation(link)).toBe(true);
    });

    it('dans son propre contexte, un gestionnaire ne relie ni le moyen ni le projet d’une autre association', async () => {
      for (const [project, method] of [
        [PROJECTS.b, METHODS.orangeA],
        [PROJECTS.a, METHODS.cashB],
      ]) {
        const error = await errorOf(
          h.asRollback(asManagerOf(B), (tx) =>
            tx.execute(sql`INSERT INTO project_payment_methods (project_id, payment_method_id, association_id)
                           VALUES (${project}, ${method}, ${B.id})`),
          ),
        );
        expect({ project, method, code: pgCode(error) }).toEqual({ project, method, code: '23503' });
      }
    });

    it('un gestionnaire de A ne déplace pas son projet ni son lien vers B', async () => {
      for (const statement of [
        sql`UPDATE projects SET association_id = ${B.id} WHERE id = ${PROJECTS.a}`,
        sql`UPDATE project_payment_methods SET association_id = ${B.id} WHERE project_id = ${PROJECTS.a}`,
      ]) {
        const error = await errorOf(h.asRollback(asManagerOf(A), (tx) => tx.execute(statement)));
        expect(isRlsViolation(error)).toBe(true);
      }
    });

    it('un gestionnaire de A ne modifie ni ne supprime rien de B', async () => {
      const results = await h.asRollback(asManagerOf(A), async (tx) => [
        (await tx.execute(sql`UPDATE projects SET name = 'piraté' WHERE id = ${PROJECTS.b}`)).rowCount,
        (await tx.execute(sql`DELETE FROM project_payment_methods WHERE project_id = ${PROJECTS.b}`)).rowCount,
        (await tx.execute(sql`DELETE FROM projects WHERE id = ${PROJECTS.b}`)).rowCount,
      ]);
      expect(results).toEqual([0, 0, 0]);
    });

    it('membre de A et de B, dans le contexte de B : aucun projet de A', async () => {
      await h.as({ space: 'association', associationId: B.id, userId: USERS.awa }, async (tx) => {
        expect(await projectIds(tx)).toEqual([PROJECTS.b]);
        expect(await linkedProjects(tx)).toEqual([PROJECTS.b]);
      });
    });
  });

  describe('autres espaces', () => {
    it.each([
      ['souscripteur sans inscription', asSubscriber(USERS.moussa)],
      ['plateforme', { space: 'platform', userId: USERS.awa }],
      ['public', { space: 'public' }],
      ['auth', { space: 'auth', userId: USERS.awa }],
      ['association sans association', { space: 'association', userId: USERS.awa }],
    ] as const)('espace %s : rien', async (_name, context) => {
      await h.as(context, async (tx) => {
        expect(await projectIds(tx)).toEqual([]);
        expect(await linkedProjects(tx)).toEqual([]);
      });
    });

    it('sans contexte, ou sans aucune variable app.* : rien', async () => {
      for (const table of ['projects', 'project_payment_methods']) {
        expect({ table, n: await h.count(null, table) }).toEqual({ table, n: 0 });
        expect({ table, n: await h.countWithoutTenantDatabase(table) }).toEqual({ table, n: 0 });
      }
    });

    it('espace system (worker, projects.activate) : tous les projets, aucun lien de moyen de paiement', async () => {
      const seen = await h.superuserRollback(async (client) => {
        await client.query(`SET LOCAL ROLE cotiz_app; SET LOCAL app.space = 'system'`);
        const projects = (await client.query<{ id: string }>('SELECT id FROM projects ORDER BY id')).rows;
        const links = (await client.query('SELECT 1 FROM project_payment_methods')).rowCount;
        return { projects: projects.map((r) => r.id), links };
      });
      expect(seen).toEqual({ projects: [PROJECTS.a, PROJECTS.b], links: 0 });
    });
  });

  describe('lectures du module projects', () => {
    it('comptes de projets : espace plateforme seulement', async () => {
      for (const context of [asManagerOf(A), asSubscriber(USERS.moussa)]) {
        await expect(h.as(context, () => platformProjectCountsOf([A.id]))).rejects.toThrow(/plateforme seulement/);
      }
    });

    it('moyens retenus par un projet : dans le contexte de cette association seulement', async () => {
      expect(await h.as(asManagerOf(A), () => paymentMethodsInUse(A.id, [METHODS.orangeA, METHODS.bankB]))).toEqual(
        new Set([METHODS.orangeA]),
      );
      await expect(h.as(asManagerOf(A), () => paymentMethodsInUse(B.id, [METHODS.bankB]))).rejects.toThrow(
        /contexte de l’association/,
      );
    });
  });

  describe('invariants', () => {
    it('un projet référence une association existante', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(PROJECT_INSERT, [
            '00000000-0000-7000-8000-00000000c1f2',
            '00000000-0000-7000-8000-00000000a999',
            'x',
            USERS.awa,
          ]),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('un projet référence son auteur', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(PROJECT_INSERT, [
            '00000000-0000-7000-8000-00000000c1f6',
            A.id,
            'x',
            '00000000-0000-7000-8000-000000000999',
          ]),
        ),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('un lien référence un projet et un moyen de paiement existants', async () => {
      for (const [project, method] of [
        ['00000000-0000-7000-8000-00000000c1f3', METHODS.orangeA],
        [PROJECTS.a, '00000000-0000-7000-8000-0000000aa1f3'],
      ]) {
        const error = await h.superuserRollback((client) =>
          errorOf(
            client.query(
              'INSERT INTO project_payment_methods (project_id, payment_method_id, association_id) VALUES ($1, $2, $3)',
              [project, method, A.id],
            ),
          ),
        );
        expect({ project, method, code: pgCode(error) }).toEqual({ project, method, code: '23503' });
      }
    });

    it('un moyen de paiement relié à un projet ne se supprime pas (lot 2.1 : il se désactive)', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(client.query('DELETE FROM association_payment_methods WHERE id = $1', [METHODS.orangeA])),
      );
      expect(pgCode(error)).toBe('23503');
    });

    it('un moyen n’est retenu qu’une fois par projet', async () => {
      const error = await h.superuserRollback((client) =>
        errorOf(
          client.query(
            'INSERT INTO project_payment_methods (project_id, payment_method_id, association_id) VALUES ($1, $2, $3)',
            [PROJECTS.a, METHODS.orangeA, A.id],
          ),
        ),
      );
      expect(pgCode(error)).toBe('23505');
    });

    it('valeurs par défaut : brouillon, 5 jours de grâce, XOF, version 1, non verrouillé', async () => {
      const { rows } = await h.superuser(
        `SELECT status, grace_days, currency, version, financial_terms_locked_at FROM projects WHERE id = $1`,
        [PROJECTS.a],
      );
      expect(rows).toEqual([
        { status: 'draft', grace_days: 5, currency: 'XOF', version: 1, financial_terms_locked_at: null },
      ]);
    });
  });

  describe('les tests échouent si une politique manque ou s’élargit', () => {
    it.each([
      ['projects', 'tenant_isolation', projectIds],
      ['project_payment_methods', 'tenant_isolation', linkedProjects],
    ] as const)('%s.%s élargie : le gestionnaire de A voit B', async (table, policy, read) => {
      const seen = await h.withPolicy(table, policy, { using: 'true', withCheck: 'true' }, () =>
        h.as(asManagerOf(A), read),
      );
      expect(seen).toEqual([PROJECTS.a, PROJECTS.b]);
    });

    it.each([
      ['projects', 'tenant_isolation', projectIds],
      ['project_payment_methods', 'tenant_isolation', linkedProjects],
    ] as const)('%s.%s retirée : le gestionnaire ne voit plus rien des siens', async (table, policy, read) => {
      const seen = await h.withoutPolicy(table, policy, () => h.as(asManagerOf(A), read));
      expect(seen).toEqual([]);
    });

    const tenant = 'association_id = app_association_id()';
    const system = "app_space() = 'system'";

    it.each([
      [
        'projects',
        'tenant_isolation',
        tenant,
        (tx: Tx) => insertProject(tx, '00000000-0000-7000-8000-00000000c1f4', B.id),
      ],
      ['project_payment_methods', 'tenant_isolation', tenant, insertLinkInB],
      [
        'projects',
        'system_access',
        system,
        (tx: Tx) => insertProject(tx, '00000000-0000-7000-8000-00000000c1f5', B.id),
      ],
    ] as const)(
      '%s.%s en WITH CHECK (true) : le gestionnaire de A écrit dans B, que les tests d’écriture refusent',
      async (table, policy, using, write) => {
        const written = await h.withPolicy(table, policy, { using, withCheck: 'true' }, () =>
          h.asRollback(asManagerOf(A), async (tx) => (await write(tx)).rowCount),
        );
        expect(written).toBe(1);
      },
    );

    it('projects.system_access élargie hors espace system : un souscripteur verrait tous les projets', async () => {
      const seen = await h.withPolicy('projects', 'system_access', { using: 'true', withCheck: 'true' }, () =>
        h.as(asSubscriber(USERS.moussa), projectIds),
      );
      expect(seen).toEqual([PROJECTS.a, PROJECTS.b]);
    });
  });
});
