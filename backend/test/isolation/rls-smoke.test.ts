import { readFile } from 'node:fs/promises';
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
  pgMessage,
  startIsolationHarness,
  type Tx,
  USERS,
} from './harness.js';

/**
 * Portage de docs/specs/rls-smoke-test.sql (6 scénarios), sur une base construite depuis docs/specs/schema.sql et sur
 * la base migrée. Lot 2.3 : toutes les tables du jeu de données sont migrées, sauf payments et allocations (lot 2.4) ;
 * le scénario 4 reste sur schema.sql seulement, et le lot 2.4 retire cette dépendance.
 * Scénarios 1 à 3 : rôle cotiz_app, contexte posé par TenantDatabase (le chemin de l'api). 4 et 5 : superutilisateur.
 * Scénario 6 (audit_logs, lot 0.5) : sur la base migrée, dans audit-append-only.test.ts.
 */
const SMOKE_TEST = new URL('../../../docs/specs/rls-smoke-test.sql', import.meta.url);

const PROJECT_A = '00000000-0000-7000-8000-00000000c001';
const ENROLLMENT_MOUSSA = '00000000-0000-7000-8000-00000000e001';
const INSTALLMENT_MOUSSA_1 = '00000000-0000-7000-8000-00000000d001';
const INSTALLMENT_MOUSSA_2 = '00000000-0000-7000-8000-00000000d002';
const PAYMENT = '00000000-0000-7000-8000-0000000fa001';
const INTRUDER_PROJECT = '00000000-0000-7000-8000-00000000c999';

/** Tables du jeu de données soumises à la RLS. */
const SEEDED_TABLES = ['associations', 'memberships', 'projects', 'enrollments', 'installments'] as const;

/** Le jeu de données du test de fumée : son premier bloc BEGIN … COMMIT, repris tel quel. */
async function smokeSeed(): Promise<string> {
  const match = /^BEGIN;\n([\s\S]*?)^COMMIT;/m.exec(await readFile(SMOKE_TEST, 'utf8'));
  if (!match?.[1]) throw new Error('rls-smoke-test.sql : bloc de données introuvable');
  return match[1];
}

/** Chaque scénario lève une erreur nommée comme dans le script SQL (« ÉCHEC 1a… »). */
function expectCount(actual: number, expected: number, failure: string): void {
  if (actual !== expected) throw new Error(`${failure} : ${String(actual)} ligne(s) au lieu de ${String(expected)}`);
}

const countIn = (tx: Tx) => async (table: string) =>
  (await tx.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM ${sql.identifier(table)}`)).rows[0]?.n ?? 0;

async function scenario1(h: IsolationHarness): Promise<void> {
  await h.as(asManagerOf(A), async (tx) => {
    const count = countIn(tx);
    expectCount(await count('installments'), 2, 'ÉCHEC 1a : fuite ou manque sur installments');
    expectCount(await count('projects'), 1, 'ÉCHEC 1b : fuite sur projects');
    expectCount(await count('associations'), 1, 'ÉCHEC 1c : fuite sur associations');
  });
  // Écrire dans une autre association doit échouer. Transaction toujours annulée : un INSERT accepté à tort ne
  // reste pas en base.
  const error = await errorOf(
    h.asRollback(asManagerOf(A), (tx) =>
      tx.execute(sql`INSERT INTO projects (id, association_id, name, description, status, installment_amount,
                       frequency, due_day, schedule_type, start_date, created_by)
                     VALUES (${INTRUDER_PROJECT}, ${B.id}, 'intrus', '', 'draft', 1, 'monthly', 5, 'fixed',
                       '2026-01-01', ${USERS.awa})`),
    ),
  );
  if (error === null) throw new Error('ÉCHEC 1d : écriture inter-association acceptée');
  if (!isRlsViolation(error)) throw new Error('ÉCHEC 1d : refus qui ne vient pas de la RLS', { cause: error });
}

async function scenario2(h: IsolationHarness): Promise<void> {
  // Le script ne lit que installments ; toutes les tables du jeu de données sont vérifiées ici.
  for (const table of SEEDED_TABLES) {
    expectCount(await h.count(null, table), 0, `ÉCHEC 2 : lignes visibles sans contexte (${table})`);
  }
}

async function scenario3(h: IsolationHarness): Promise<void> {
  const moussa = asSubscriber(USERS.moussa);
  expectCount(await h.count(moussa, 'installments'), 2, 'ÉCHEC 3a');
  expectCount(await h.count(moussa, 'projects'), 1, 'ÉCHEC 3b');
  expectCount(await h.count(moussa, 'associations'), 1, 'ÉCHEC 3c');
}

/**
 * Complément au script : Moussa (souscripteur de A) dans un contexte d'association B ne voit pas ses lignes de A
 * (les politiques souscripteur, member_read et self_read exigent l'espace subscriber ou auth, lot 1.2).
 */
async function scenario3d(h: IsolationHarness): Promise<void> {
  await h.as({ space: 'association', associationId: B.id, userId: USERS.moussa }, async (tx) => {
    const count = countIn(tx);
    expectCount(await count('associations'), 1, 'ÉCHEC 3d : associations de souscripteur visibles hors espace');
    expectCount(await count('memberships'), 1, 'ÉCHEC 3d : appartenances de souscripteur visibles hors espace');
    expectCount(await count('installments'), 1, 'ÉCHEC 3d : échéances de souscripteur visibles hors espace');
    expectCount(await count('projects'), 1, 'ÉCHEC 3d : projets de souscripteur visibles hors espace');
    expectCount(await count('enrollments'), 1, 'ÉCHEC 3d : inscriptions de souscripteur visibles hors espace');
  });
}

/**
 * Jeu de données du script, sauf les personnes sur la base migrée : le harnais y crée déjà celles de USERS, aux mêmes
 * identifiants.
 */
async function smokeSeedFor(base: 'spec' | 'migrated'): Promise<string> {
  const seed = await smokeSeed();
  if (base === 'spec') return seed;
  const statements = seed.split(/;\n(?=INSERT)/).map((s) => s.replace(/;\s*$/, ''));
  const kept = statements.filter((s) => SEEDED_TABLES.some((t) => s.startsWith(`INSERT INTO ${t} `)));
  if (kept.length !== SEEDED_TABLES.length) throw new Error('rls-smoke-test.sql : données introuvables');
  return kept.join(';\n') + ';';
}

describe.each(['spec', 'migrated'] as const)(
  'test de fumée de l’isolation et des invariants (docs/specs/rls-smoke-test.sql, base %s)',
  (base) => {
    let h: IsolationHarness;

    beforeAll(async () => {
      h = await startIsolationHarness(base);
      await h.superuser(await smokeSeedFor(base));
    });

    afterAll(async () => {
      await h.stop();
    });

    it('1. un gestionnaire d’Entraide Yopougon ne voit que son association et ne peut pas écrire ailleurs', async () => {
      await expect(scenario1(h)).resolves.toBeUndefined();
    });

    it('2. sans contexte : zéro ligne, sans erreur', async () => {
      await expect(scenario2(h)).resolves.toBeUndefined();
    });

    it('2. sans aucune variable app.* posée (connexion brute en cotiz_app) : zéro ligne', async () => {
      for (const table of SEEDED_TABLES) expect(await h.countWithoutTenantDatabase(table)).toBe(0);
    });

    it('3. le souscripteur Moussa ne voit que ses échéances, son projet et son association', async () => {
      await expect(scenario3(h)).resolves.toBeUndefined();
    });

    it('3d. hors de l’espace subscriber, les lignes de souscripteur ne sont pas visibles', async () => {
      await expect(scenario3d(h)).resolves.toBeUndefined();
    });

    // payments et allocations : lot 2.4.
    describe.runIf(base === 'spec')(
      '4. un paiement validé dont les allocations ne font pas le compte est refusé au COMMIT',
      () => {
        const declare = `
      INSERT INTO payments (id, association_id, project_id, enrollment_id, user_id, amount_declared, paid_on,
                            transaction_reference, status, idempotency_key)
      VALUES ('${PAYMENT}', '${A.id}', '${PROJECT_A}', '${ENROLLMENT_MOUSSA}',
              '${USERS.moussa}', 50000, '2026-04-06', 'OM-123', 'pending', 'k1');`;
        const allocate = (installment: string) => `
      INSERT INTO allocations (id, association_id, payment_id, installment_id, amount, state)
      VALUES (gen_random_uuid(), '${A.id}', '${PAYMENT}', '${installment}', 25000, 'confirmed');`;
        const validate = `UPDATE payments SET status = 'validated' WHERE id = '${PAYMENT}';`;
        const unbalanced = declare + allocate(INSTALLMENT_MOUSSA_1) + validate;

        it('SET CONSTRAINTS … IMMEDIATE lève allocation_mismatch (comme le script)', async () => {
          const error = await h.superuserRollback(async (client) => {
            await client.query(unbalanced);
            return errorOf(client.query('SET CONSTRAINTS payments_allocations_sum IMMEDIATE'));
          });
          expect(pgMessage(error)).toBe('allocation_mismatch');
          expect(pgCode(error)).toBe('P0001');
        });

        it('témoin : allocations confirmées égales au montant, la contrainte est satisfaite', async () => {
          const error = await h.superuserRollback(async (client) => {
            await client.query(declare + allocate(INSTALLMENT_MOUSSA_1) + allocate(INSTALLMENT_MOUSSA_2) + validate);
            return errorOf(client.query('SET CONSTRAINTS payments_allocations_sum IMMEDIATE'));
          });
          expect(error).toBeNull();
        });

        it('le COMMIT lui-même échoue et rien n’est enregistré', async () => {
          const error = await errorOf(h.superuser(`BEGIN; ${unbalanced} COMMIT;`));
          expect(pgMessage(error)).toBe('allocation_mismatch');
          const { rows } = await h.superuser(
            'SELECT (SELECT count(*)::int FROM payments WHERE id = $1) AS payments, ' +
              '(SELECT count(*)::int FROM allocations WHERE payment_id = $1) AS allocations',
            [PAYMENT],
          );
          expect(rows[0]).toEqual({ payments: 0, allocations: 0 });
        });
      },
    );

    describe('5. une échéance ne peut pas être sur-engagée', () => {
      const update = (paid: number, pending: number) =>
        h.superuserRollback((client) =>
          errorOf(
            client.query('UPDATE installments SET amount_paid = $1, amount_pending = $2 WHERE id = $3', [
              paid,
              pending,
              INSTALLMENT_MOUSSA_1,
            ]),
          ),
        );

      it('payé + en attente au-delà du dû : installments_no_overcommit', async () => {
        const error = await update(20000, 10000);
        expect(pgCode(error)).toBe('23514');
        expect(pgConstraint(error)).toBe('installments_no_overcommit');
      });

      it('témoin : payé + en attente égal au dû, accepté', async () => {
        expect(await update(20000, 5000)).toBeNull();
      });
    });

    // 6. Journal d'audit en ajout seul : table migrée depuis le lot 0.5, scénario porté dans audit-append-only.test.ts.

    // « Retirer une politique la fait échouer » : chaque politique en jeu, retirée, fait échouer son scénario.
    // Exception : associations.tenant_self retirée, le gestionnaire (membre) voit encore son association par
    // member_read ; aucune fuite, le scénario 1 reste vert à raison.
    describe('le test de fumée échoue si une politique manque ou s’élargit', () => {
      it.each([
        ['installments', 'tenant_isolation', scenario1, /ÉCHEC 1a/],
        ['projects', 'tenant_isolation', scenario1, /ÉCHEC 1b/],
        ['installments', 'subscriber_self_read', scenario3, /ÉCHEC 3a/],
        ['projects', 'subscriber_enrolled_read', scenario3, /ÉCHEC 3b/],
        // La sous-requête de projects.subscriber_enrolled_read lit enrollments, elle-même soumise à la RLS.
        ['enrollments', 'subscriber_self_read', scenario3, /ÉCHEC 3b/],
        ['associations', 'member_read', scenario3, /ÉCHEC 3c/],
        ['memberships', 'self_read', scenario3, /ÉCHEC 3c/],
      ] as const)('%s.%s retirée', async (table, policy, scenario, failure) => {
        await h.withoutPolicy(table, policy, () => expect(scenario(h)).rejects.toThrow(failure));
        await expect(scenario(h)).resolves.toBeUndefined();
      });

      it('projects.tenant_isolation en WITH CHECK (true) : l’écriture inter-association est détectée', async () => {
        const tenant = 'association_id = app_association_id()';
        await h.withPolicy('projects', 'tenant_isolation', { using: tenant, withCheck: 'true' }, () =>
          expect(scenario1(h)).rejects.toThrow(/ÉCHEC 1d/),
        );
        expect((await h.superuser('SELECT 1 FROM projects WHERE id = $1', [INTRUDER_PROJECT])).rowCount).toBe(0);
      });

      it('memberships.self_read sans condition d’espace : détecté par 3d', async () => {
        const widened = { using: 'user_id = app_user_id()', withCheck: null };
        await h.withPolicy('memberships', 'self_read', widened, () =>
          expect(scenario3d(h)).rejects.toThrow(/ÉCHEC 3d : appartenances/),
        );
      });

      it('installments.subscriber_self_read sans condition d’espace : détecté par 3d', async () => {
        const widened = { using: 'user_id = app_user_id()', withCheck: null };
        await h.withPolicy('installments', 'subscriber_self_read', widened, () =>
          expect(scenario3d(h)).rejects.toThrow(/ÉCHEC 3d : échéances/),
        );
      });

      it('projects.subscriber_enrolled_read sans condition d’espace : détecté par 3d', async () => {
        const enrolled =
          'EXISTS (SELECT 1 FROM enrollments e WHERE e.project_id = projects.id AND e.user_id = app_user_id())';
        const selfRead = { using: 'user_id = app_user_id()', withCheck: null };
        await h.withPolicy('projects', 'subscriber_enrolled_read', { using: enrolled, withCheck: null }, () =>
          h.withPolicy('enrollments', 'subscriber_self_read', selfRead, () =>
            expect(scenario3d(h)).rejects.toThrow(/ÉCHEC 3d : projets/),
          ),
        );
      });

      it('RLS désactivée sur installments : fuite détectée, avec ou sans contexte', async () => {
        await h.withRlsDisabled('installments', async () => {
          await expect(scenario1(h)).rejects.toThrow(/ÉCHEC 1a/);
          await expect(scenario2(h)).rejects.toThrow(/ÉCHEC 2/);
        });
        await expect(scenario2(h)).resolves.toBeUndefined();
      });
    });
  },
);
