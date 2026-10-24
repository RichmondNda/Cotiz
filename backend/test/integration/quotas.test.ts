import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { QuotaService } from '../../src/modules/billing/billing.public.js';
import { DomainProblem } from '../../src/shared/http/domain-problem.js';
import { currentTx, TenantDatabase } from '../../src/shared/tenant-context/index.js';
import {
  A,
  asManagerOf,
  B,
  type FixtureAssociation,
  type IsolationHarness,
  seedAssociations,
  startIsolationHarness,
  USERS,
} from '../isolation/harness.js';

/**
 * Lot 1.2 · étape 5 : QuotaService.assert (architecture/02, « Quotas de plan » ; choix Q7). Limites de l'abonnement en
 * cours (trialing, active, past_due) et usage lus en base, sous le verrou du quota, dans la transaction de
 * l'association (lot 1.4 : plus de cache des limites, un changement de plan est vu dès son COMMIT). Dépassement : 409
 * quota_exceeded avec limit et usage.
 */

const PLANS = {
  small: '00000000-0000-7000-8000-0000000d0001',
  unlimited: '00000000-0000-7000-8000-0000000d0002',
} as const;

describe('QuotaService (quotas du plan de l’association)', () => {
  let h: IsolationHarness;
  let db: TenantDatabase;
  let quotas: QuotaService;

  const assertIn = (association: FixtureAssociation, kind: 'projects' | 'subscribers' | 'managers') =>
    db.withTenantContext(asManagerOf(association), () => quotas.assert(association.id, kind));

  /** `null` si l'ajout est permis, sinon le problème levé. */
  const outcome = async (
    association: FixtureAssociation,
    kind: 'projects' | 'subscribers' | 'managers',
  ): Promise<{ code: string; limit?: number; usage?: number } | null> => {
    try {
      await assertIn(association, kind);
      return null;
    } catch (error) {
      if (!(error instanceof DomainProblem)) throw error;
      return { code: error.code, ...error.details };
    }
  };

  const subscribe = (
    association: FixtureAssociation,
    planId: string,
    status = 'active',
    override: number | null = null,
  ) =>
    h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start,
                                  manager_seats_override)
       VALUES (gen_random_uuid(), $1, $2, 'monthly', $3, current_date, $4)`,
      [association.id, planId, status, override],
    );

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
                          features, is_active) VALUES
         ($1, 'q-small', 'Petit', 0, 0, 1, 2, 2, '{}', true),
         ($2, 'q-unlimited', 'Illimité', 1000, 12000, NULL, NULL, NULL, '{}', true)`,
      [PLANS.small, PLANS.unlimited],
    );
    db = new TenantDatabase({ connectionString: h.db.urlFor('cotiz_app'), max: 4 });
    quotas = new QuotaService();
  });

  afterAll(async () => {
    await db.onModuleDestroy();
    await h.stop();
  });

  beforeEach(async () => {
    await h.superuser('DELETE FROM subscriptions');
    await h.superuser('DELETE FROM memberships');
    await h.superuser(`UPDATE plans SET max_managers = 2, max_subscribers = 2 WHERE id = $1`, [PLANS.small]);
    // A : 2 comptes gestionnaires (owner actif, manager invité ; viewer retiré non compté), 2 souscripteurs (actif,
    // invité ; retiré non compté). B : ses propres membres, dont Moussa gestionnaire, jamais comptés pour A.
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status) VALUES
         (gen_random_uuid(), $1, $3, 'owner', 'active'),
         (gen_random_uuid(), $1, $4, 'manager', 'invited'),
         (gen_random_uuid(), $1, $5, 'viewer', 'removed'),
         (gen_random_uuid(), $1, $6, 'subscriber', 'active'),
         (gen_random_uuid(), $1, $5, 'subscriber', 'invited'),
         (gen_random_uuid(), $1, $7, 'subscriber', 'removed'),
         (gen_random_uuid(), $2, $4, 'owner', 'active'),
         (gen_random_uuid(), $2, $6, 'manager', 'active'),
         (gen_random_uuid(), $2, $7, 'subscriber', 'active'),
         (gen_random_uuid(), $2, $3, 'subscriber', 'active')`,
      [A.id, B.id, USERS.awa, USERS.koffi, USERS.aminata, USERS.moussa, USERS.fatou],
    );
  });

  describe('limite et usage', () => {
    it('limite atteinte : 409 quota_exceeded avec limit et usage (retirés non comptés, autres associations non plus)', async () => {
      await subscribe(A, PLANS.small);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      expect(await outcome(A, 'subscribers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
    });

    it('sous la limite : permis', async () => {
      await subscribe(A, PLANS.small);
      await h.superuser(`UPDATE plans SET max_managers = 3, max_subscribers = 3 WHERE id = $1`, [PLANS.small]);
      expect(await outcome(A, 'managers')).toBeNull();
      expect(await outcome(A, 'subscribers')).toBeNull();
    });

    it('quota null : illimité', async () => {
      await subscribe(A, PLANS.unlimited);
      expect(await outcome(A, 'managers')).toBeNull();
      expect(await outcome(A, 'subscribers')).toBeNull();
    });

    it('manager_seats_override remplace max_managers (gestionnaires seulement)', async () => {
      await subscribe(A, PLANS.small, 'active', 3);
      expect(await outcome(A, 'managers')).toBeNull();
      expect(await outcome(A, 'subscribers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await h.superuser('UPDATE subscriptions SET manager_seats_override = 1');
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 1, usage: 2 });
    });

    it.each(['trialing', 'past_due'])('abonnement %s : en cours, ses limites s’appliquent', async (status) => {
      await subscribe(A, PLANS.unlimited, status);
      expect(await outcome(A, 'managers')).toBeNull();
    });

    it.each([
      ['aucun abonnement', null],
      ['abonnement suspendu', 'suspended'],
      ['abonnement résilié', 'canceled'],
    ])('%s : limite 0', async (_why, status) => {
      if (status) await subscribe(A, PLANS.unlimited, status);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 0, usage: 2 });
      expect(await outcome(A, 'subscribers')).toEqual({ code: 'quota_exceeded', limit: 0, usage: 2 });
    });

    it('usage compté en direct : un membre retiré libère sa place sans invalidation', async () => {
      await subscribe(A, PLANS.small);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await h.superuser(`UPDATE memberships SET status = 'removed' WHERE association_id = $1 AND role = 'manager'`, [
        A.id,
      ]);
      expect(await outcome(A, 'managers')).toBeNull();
    });

    it('projets : brouillons, inscriptions ouvertes et en cours comptés ; terminés, archivés et autres associations non (Q6)', async () => {
      await subscribe(A, PLANS.small);
      const project = (association: FixtureAssociation, status: string) =>
        h.superuser(
          `INSERT INTO projects (id, association_id, name, description, status, installment_amount, frequency,
                                 due_day, schedule_type, start_date, created_by)
           VALUES (gen_random_uuid(), $1, 'P', '', $2, 1000, 'monthly', 5, 'rolling', '2026-01-01', $3)`,
          [association.id, status, association.managerId],
        );
      await h.superuser('DELETE FROM projects');
      try {
        await project(A, 'completed');
        await project(A, 'archived');
        await project(B, 'active');
        expect(await outcome(A, 'projects')).toBeNull();
        await h.superuser(`UPDATE plans SET max_projects = 3 WHERE id = $1`, [PLANS.small]);
        for (const status of ['draft', 'enrolling', 'active']) await project(A, status);
        expect(await outcome(A, 'projects')).toEqual({ code: 'quota_exceeded', limit: 3, usage: 3 });
      } finally {
        await h.superuser('DELETE FROM projects');
        await h.superuser(`UPDATE plans SET max_projects = 1 WHERE id = $1`, [PLANS.small]);
      }
    });
  });

  describe('contexte', () => {
    it('hors du contexte de cette association : refusé (jamais les limites ni l’usage d’une autre)', async () => {
      await subscribe(A, PLANS.unlimited);
      await subscribe(B, PLANS.unlimited);
      await expect(db.withTenantContext(asManagerOf(A), () => quotas.assert(B.id, 'managers'))).rejects.toThrow(
        /contexte de l’association/,
      );
      await expect(
        db.withTenantContext({ space: 'platform', userId: USERS.awa }, () => quotas.assert(A.id, 'managers')),
      ).rejects.toThrow(/contexte de l’association/);
    });

    it('ajouts concurrents : verrou par association et quota, un seul passe la limite', async () => {
      await subscribe(A, PLANS.small, 'active', 3);
      const addManager = (userId: string) =>
        db.withTenantContext(asManagerOf(A), async () => {
          await quotas.assert(A.id, 'managers');
          // Laisse à l'autre transaction le temps d'arriver au contrôle avant le COMMIT de celle-ci.
          await currentTx().execute(sql`SELECT pg_sleep(0.2)`);
          await currentTx().execute(
            sql`INSERT INTO memberships (id, association_id, user_id, role, status)
                VALUES (gen_random_uuid(), ${A.id}, ${userId}, 'manager', 'invited')`,
          );
        });
      const results = await Promise.allSettled([addManager(USERS.moussa), addManager(USERS.fatou)]);
      expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected']);
      const rejected = results.find((r) => r.status === 'rejected');
      expect(rejected?.reason).toBeInstanceOf(DomainProblem);
      expect(rejected?.reason).toMatchObject({ code: 'quota_exceeded', details: { limit: 3, usage: 3 } });
    });
    it('limite modifiée en base : appliquée dès l’ajout suivant, sans invalidation', async () => {
      await subscribe(A, PLANS.small);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await h.superuser(`UPDATE plans SET max_managers = 3 WHERE id = $1`, [PLANS.small]);
      expect(await outcome(A, 'managers')).toBeNull();
      await h.superuser(`UPDATE subscriptions SET plan_id = $1 WHERE association_id = $2`, [PLANS.unlimited, A.id]);
      expect(await outcome(A, 'subscribers')).toBeNull();
    });

    it('limite abaissée pendant un ajout (changement de plan) : l’ajout attend le verrou et voit la nouvelle limite', async () => {
      // Limite 3, usage 2 (owner actif, manager invité). Une transaction de la plateforme prend le verrou du quota,
      // abaisse la limite à 2, attend, puis valide ; l'ajout lancé pendant ce temps doit être refusé.
      await subscribe(A, PLANS.small, 'active', 3);
      const lowering = h.superuser(
        `BEGIN;
         SELECT pg_advisory_xact_lock(hashtextextended('quota:${A.id}:managers', 0));
         UPDATE subscriptions SET manager_seats_override = NULL WHERE association_id = '${A.id}';
         SELECT pg_sleep(0.4);
         COMMIT;`,
      );
      await new Promise((resolve) => setTimeout(resolve, 100));
      const added = await outcome(A, 'managers');
      await lowering;
      expect(added).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
    });
  });
});
