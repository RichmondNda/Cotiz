import type { EventEnvelope, EventType } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { QuotaService } from '../../src/modules/billing/billing.public.js';
import { QuotaLimitsCacheConsumer } from '../../src/modules/billing/events/quota-limits-cache.consumer.js';
import { readQuotaLimits, writeQuotaLimits } from '../../src/modules/billing/infra/quota-limits-cache.js';
import { DomainProblem } from '../../src/shared/http/domain-problem.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import type { RedisClient } from '../../src/shared/redis/redis.module.js';
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
 * cours (trialing, active, past_due) en cache 5 min, invalidées par plan.updated et subscription.plan_changed ; usage
 * compté en direct dans la transaction de l'association. Dépassement : 409 quota_exceeded avec limit et usage.
 */

const PLANS = {
  small: '00000000-0000-7000-8000-0000000d0001',
  unlimited: '00000000-0000-7000-8000-0000000d0002',
} as const;

describe('QuotaService (quotas du plan de l’association)', () => {
  let h: IsolationHarness;
  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let db: TenantDatabase;
  let quotas: QuotaService;
  const consumers = new EventConsumers();
  let consumer: QuotaLimitsCacheConsumer;

  const assertIn = (association: FixtureAssociation, kind: 'projects' | 'subscribers' | 'managers', service = quotas) =>
    db.withTenantContext(asManagerOf(association), () => service.assert(association.id, kind));

  /** `null` si l'ajout est permis, sinon le problème levé. */
  const outcome = async (
    association: FixtureAssociation,
    kind: 'subscribers' | 'managers',
    service = quotas,
  ): Promise<{ code: string; limit?: number; usage?: number } | null> => {
    try {
      await assertIn(association, kind, service);
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

  const deliver = async (type: EventType, associationId: string | null, payload: Record<string, unknown>) => {
    const handlers = consumers.for(type);
    expect(handlers.map((c) => c.name)).toEqual(['quota-limits-cache']);
    const event: EventEnvelope = {
      id: '1',
      type,
      version: 1,
      occurredAt: new Date().toISOString(),
      associationId,
      actorUserId: null,
      aggregate: { type: type === 'plan.updated' ? 'plan' : 'subscription', id: PLANS.small },
      payload,
    };
    for (const handler of handlers) await handler.handle(event);
  };
  const planUpdated = (planId: string) => deliver('plan.updated', null, { planId });
  const planChanged = (association: FixtureAssociation) =>
    deliver('subscription.plan_changed', association.id, {
      associationId: association.id,
      fromPlanId: PLANS.small,
      toPlanId: PLANS.unlimited,
      effectiveAt: new Date().toISOString(),
    });

  beforeAll(async () => {
    [h, redisContainer] = await Promise.all([
      startIsolationHarness('migrated'),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
                          features, is_active) VALUES
         ($1, 'q-small', 'Petit', 0, 0, 1, 2, 2, '{}', true),
         ($2, 'q-unlimited', 'Illimité', 1000, 12000, NULL, NULL, NULL, '{}', true)`,
      [PLANS.small, PLANS.unlimited],
    );
    redis = new Redis(redisContainer.getConnectionUrl(), { maxRetriesPerRequest: 1 });
    db = new TenantDatabase({ connectionString: h.db.urlFor('cotiz_app'), max: 4 });
    quotas = new QuotaService({ redis } as RedisClient);
    consumer = new QuotaLimitsCacheConsumer(
      consumers,
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: h.db.urlFor('cotiz_app'),
        REDIS_URL: redisContainer.getConnectionUrl(),
        S3_ENDPOINT: 'http://127.0.0.1:1',
      }),
    );
    consumer.onModuleInit();
  });

  afterAll(async () => {
    consumer.onModuleDestroy();
    redis.disconnect();
    await db.onModuleDestroy();
    await Promise.all([h.stop(), redisContainer.stop()]);
  });

  beforeEach(async () => {
    await redis.flushall();
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
      await planChanged(A);
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

    it('projets : compteur branché au lot 2.1, échec explicite d’ici là', async () => {
      await subscribe(A, PLANS.unlimited);
      await expect(assertIn(A, 'projects')).rejects.toThrow(/lot 2\.1/);
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
  });

  describe('cache des limites (5 min)', () => {
    it('limites servies par le cache jusqu’à plan.updated', async () => {
      await subscribe(A, PLANS.small);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      expect(await redis.ttl('cotiz:cache:quotas:' + A.id)).toBeGreaterThan(290);
      await h.superuser(`UPDATE plans SET max_managers = 5 WHERE id = $1`, [PLANS.small]);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await planUpdated(PLANS.small);
      expect(await outcome(A, 'managers')).toBeNull();
    });

    it('subscription.plan_changed invalide l’association concernée seulement', async () => {
      await subscribe(A, PLANS.small);
      await subscribe(B, PLANS.small);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      expect(await outcome(B, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await h.superuser(`UPDATE subscriptions SET plan_id = $1`, [PLANS.unlimited]);
      await planChanged(A);
      expect(await outcome(A, 'managers')).toBeNull();
      expect(await outcome(B, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
    });

    it('cache propre à chaque association : jamais les limites d’une autre', async () => {
      await subscribe(A, PLANS.small);
      await subscribe(B, PLANS.unlimited);
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      expect(await outcome(B, 'managers')).toBeNull();
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      expect((await readQuotaLimits(redis, A.id)).limits).toEqual({ projects: 1, subscribers: 2, managers: 2 });
      expect((await readQuotaLimits(redis, B.id)).limits).toEqual({
        projects: null,
        subscribers: null,
        managers: null,
      });
    });

    it('limites lues avant une invalidation : jamais servies ensuite (génération)', async () => {
      await subscribe(A, PLANS.small);
      const before = await readQuotaLimits(redis, A.id);
      expect(before.limits).toBeNull();
      await planChanged(A);
      await writeQuotaLimits(redis, A.id, { projects: 0, subscribers: 0, managers: 0 }, before.generation);
      expect((await readQuotaLimits(redis, A.id)).limits).toBeNull();
      const other = await readQuotaLimits(redis, A.id);
      await planUpdated(PLANS.small);
      await writeQuotaLimits(redis, A.id, { projects: 0, subscribers: 0, managers: 0 }, other.generation);
      expect((await readQuotaLimits(redis, A.id)).limits).toBeNull();
      expect(await outcome(A, 'managers')).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
    });

    it.each([
      ['forme fausse', '{"limits":{"managers":0}}'],
      ['JSON illisible', '{pas du json'],
    ])('valeur en cache invalide (%s) : relue en base, puis réécrite', async (_why, raw) => {
      await subscribe(A, PLANS.unlimited);
      await redis.set('cotiz:cache:quotas:' + A.id, raw);
      expect(await outcome(A, 'managers')).toBeNull();
      expect((await readQuotaLimits(redis, A.id)).limits).toEqual({
        projects: null,
        subscribers: null,
        managers: null,
      });
    });

    it('Redis absent : limites lues en base, jamais de refus ni d’accord par défaut', async () => {
      const down = new Redis('redis://127.0.0.1:1', {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        commandTimeout: 200,
        retryStrategy: () => null,
      });
      down.on('error', () => undefined);
      const degraded = new QuotaService({ redis: down } as RedisClient);
      await subscribe(A, PLANS.small);
      expect(await outcome(A, 'managers', degraded)).toEqual({ code: 'quota_exceeded', limit: 2, usage: 2 });
      await h.superuser(`UPDATE plans SET max_managers = 3 WHERE id = $1`, [PLANS.small]);
      expect(await outcome(A, 'managers', degraded)).toBeNull();
      down.disconnect();
    });
  });
});
