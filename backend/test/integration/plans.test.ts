import type { INestApplication } from '@nestjs/common';
import { type EventEnvelope, LoginResponse, Plan, PlanList, PublicPlanList } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { type Config, loadConfig } from '../../src/config.js';
import { PublicPlansCacheConsumer } from '../../src/modules/billing/events/public-plans-cache.consumer.js';
import {
  invalidatePublicPlans,
  readPublicPlans,
  writePublicPlans,
} from '../../src/modules/billing/infra/public-plans-cache.js';
import { Redis } from 'ioredis';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { EventConsumers } from '../../src/shared/outbox/index.js';
import {
  A,
  errorOf,
  type IsolationHarness,
  pgCode,
  seedAssociations,
  startIsolationHarness,
  USERS,
} from '../isolation/harness.js';

/**
 * Lot 1.2 · étape 4 : plans (pub.plans, pf.plans, pf.plan.write, pf.plan.archive) à travers les vraies gardes, la
 * connexion cotiz_platform (BYPASSRLS) des routes /platform et un vrai Redis (cache public d'une heure).
 * Vérification de l'étape : un plan archivé n'est plus dans pub.plans mais reste appliqué à ses abonnés.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const OWNER = { id: '00000000-0000-7000-8000-0000000007b1', email: 'owner-plans@cotiz.test' };
const SUPPORT = { id: '00000000-0000-7000-8000-0000000007b2', email: 'support-plans@cotiz.test' };
const PLANS = {
  decouverte: '00000000-0000-7000-8000-0000000c0001',
  essentiel: '00000000-0000-7000-8000-0000000c0002',
  pro: '00000000-0000-7000-8000-0000000c0003',
} as const;
const xof = (amount: number) => ({ amount, currency: 'XOF' });

const input = (code: string, overrides: Record<string, unknown> = {}) => ({
  code,
  name: `Plan ${code}`,
  description: null,
  priceMonthly: xof(5000),
  priceYearly: xof(50000),
  limits: { projects: 2, subscribers: 50, managers: 1 },
  features: ['contracts'],
  isFeatured: false,
  isActive: true,
  ...overrides,
});

describe('plans (pub.plans, pf.plans, pf.plan.write, pf.plan.archive)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;
  let config: Config;
  let owner: string;
  let support: string;

  const call = (method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
  const login = async (space: string, identifier: string) => {
    const res = await call('POST', '/auth/login', undefined, { space, identifier, password: PASSWORD });
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return body.accessToken;
  };
  const publicPlans = async () => PublicPlanList.parse(await (await call('GET', '/public/plans')).json()).items;
  const platformPlans = async (token = support) =>
    PlanList.parse(await (await call('GET', '/platform/plans', token)).json()).items;
  const create = (body: unknown, token = owner) => call('POST', '/platform/plans', token, body);
  const patch = (id: string, body: unknown, version: number | null, token = owner) =>
    call(
      'PATCH',
      `/platform/plans/${id}`,
      token,
      body,
      version === null ? {} : { 'if-match': `W/"${String(version)}"` },
    );

  const planEvents = async (planId: string) =>
    (
      (
        await h.superuser(
          `SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'plan.updated' AND aggregate_id = $1`,
          [planId],
        )
      ).rows[0] as { n: number }
    ).n;

  /** Le consommateur du worker, branché sur les vrais abonnements : comme le relais outbox le ferait. */
  let invalidate: (planId: string) => Promise<void>;

  const resetPlans = async () => {
    await h.superuser('DELETE FROM subscriptions');
    await h.superuser(`DELETE FROM plans WHERE id <> ALL($1::uuid[])`, [Object.values(PLANS)]);
    await h.superuser(
      `INSERT INTO plans (id, code, name, description, price_monthly, price_yearly, max_projects, max_subscribers,
                          max_managers, features, is_featured, is_active, archived_at, version) VALUES
         ($1, 'decouverte', 'Découverte', NULL, 0, 0, 1, 20, 1, '{}', false, true, NULL, 1),
         ($2, 'essentiel', 'Essentiel', 'Pour les associations qui gèrent plusieurs projets.', 10000, 120000, 5, 100,
          2, '{contracts,auto_reminders}', true, true, NULL, 1),
         ($3, 'pro', 'Pro', NULL, 25000, 300000, NULL, 500, 5, '{contracts,auto_reminders,imports,analytics}', false,
          true, NULL, 1)
       ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code, name = EXCLUDED.name,
         description = EXCLUDED.description, price_monthly = EXCLUDED.price_monthly,
         price_yearly = EXCLUDED.price_yearly, max_projects = EXCLUDED.max_projects,
         max_subscribers = EXCLUDED.max_subscribers, max_managers = EXCLUDED.max_managers,
         features = EXCLUDED.features, is_featured = EXCLUDED.is_featured, is_active = true, archived_at = NULL,
         version = 1`,
      [PLANS.decouverte, PLANS.essentiel, PLANS.pro],
    );
    // A abonnée à Essentiel.
    await h.superuser(
      `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start)
       VALUES (gen_random_uuid(), $1, $2, 'monthly', 'active', current_date)`,
      [A.id, PLANS.essentiel],
    );
  };

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES
         ($1, $2, 'Richy', 'Nda', 'active'), ($3, $4, 'Sali', 'Bamba', 'active')`,
      [OWNER.id, OWNER.email, SUPPORT.id, SUPPORT.email],
    );
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner'), ($2, 'support')`, [
      OWNER.id,
      SUPPORT.id,
    ]);
    const hash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) SELECT id, $1 FROM users`, [hash]);
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now()),
              (gen_random_uuid(), $1, $3, 'owner', 'active', now())`,
      [A.id, USERS.moussa, USERS.awa],
    );
    config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
    });
    app = await createApp(config, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    owner = await login('platform', OWNER.email);
    support = await login('platform', SUPPORT.email);

    const consumers = new EventConsumers();
    const consumer = new PublicPlansCacheConsumer(consumers, config);
    consumer.onModuleInit();
    invalidate = async (planId) => {
      const [handler] = consumers.for('plan.updated');
      if (!handler) throw new Error('aucun consommateur de plan.updated');
      const event: EventEnvelope = {
        id: '1',
        type: 'plan.updated',
        version: 1,
        occurredAt: new Date().toISOString(),
        associationId: null,
        actorUserId: OWNER.id,
        aggregate: { type: 'plan', id: planId },
        payload: { planId },
      };
      await handler.handle(event);
    };
    afterAllHooks.push(() => {
      consumer.onModuleDestroy();
    });
  });

  const afterAllHooks: (() => Promise<void> | void)[] = [];
  afterAll(async () => {
    for (const hook of afterAllHooks) await hook();
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await redis.exec(['redis-cli', 'FLUSHALL']);
    await resetPlans();
  });

  describe('pub.plans : plans actifs, sans authentification, en cache 1 h', () => {
    it('plans actifs par prix croissant, montants en XOF, quotas et fonctionnalités soumises au plan', async () => {
      const items = await publicPlans();
      expect(items.map((p) => p.code)).toEqual(['decouverte', 'essentiel', 'pro']);
      expect(items[1]).toEqual({
        id: PLANS.essentiel,
        code: 'essentiel',
        name: 'Essentiel',
        description: 'Pour les associations qui gèrent plusieurs projets.',
        priceMonthly: xof(10000),
        priceYearly: xof(120000),
        limits: { projects: 5, subscribers: 100, managers: 2 },
        features: ['contracts', 'auto_reminders'],
        isFeatured: true,
      });
      expect(items[2]?.limits.projects).toBeNull();
    });

    it('servi depuis le cache ; plan.updated l’invalide (consommateur du worker)', async () => {
      expect((await publicPlans())[0]?.name).toBe('Découverte');
      await h.superuser(`UPDATE plans SET name = 'Découverte modifiée' WHERE id = $1`, [PLANS.decouverte]);
      expect((await publicPlans())[0]?.name).toBe('Découverte');
      const ttl = Number(await redis.exec(['redis-cli', 'TTL', 'cotiz:cache:pub.plans']).then((r) => r.output));
      expect(ttl).toBeGreaterThan(3500);
      expect(ttl).toBeLessThanOrEqual(3600);
      await invalidate(PLANS.decouverte);
      expect((await publicPlans())[0]?.name).toBe('Découverte modifiée');
    });

    it('lecture lente : une liste lue avant une invalidation n’est jamais servie ensuite', async () => {
      const client = new Redis(redis.getConnectionUrl());
      try {
        const before = await readPublicPlans(client);
        expect(before.items).toBeNull();
        await invalidatePublicPlans(client);
        // La lecture lente termine après l'invalidation, avec sa génération d'avant.
        await writePublicPlans(client, [], before.generation);
        expect((await readPublicPlans(client)).items).toBeNull();
        expect((await publicPlans()).map((p) => p.code)).toEqual(['decouverte', 'essentiel', 'pro']);
      } finally {
        client.disconnect();
      }
    });

    it('Redis indisponible : lu en base, jamais d’erreur', async () => {
      await redis.exec(['redis-cli', 'SET', 'cotiz:cache:pub.plans', 'pas du json']);
      expect((await publicPlans()).map((p) => p.code)).toEqual(['decouverte', 'essentiel', 'pro']);
    });
  });

  describe('pf.plans : tous les plans, archivés compris (platform.associations.read)', () => {
    it('le support lit tous les plans, avec version et nombre d’associations abonnées', async () => {
      await h.superuser(`UPDATE plans SET is_active = false, archived_at = now() WHERE id = $1`, [PLANS.pro]);
      const items = await platformPlans(support);
      expect(items.map((p) => [p.code, p.isActive, p.subscribersCount, p.version])).toEqual([
        ['decouverte', true, 0, 1],
        ['essentiel', true, 1, 1],
        ['pro', false, 0, 1],
      ]);
      expect(items[2]?.archivedAt).not.toBeNull();
    });

    it('sans jeton : 401 ; jeton souscripteur ou gestionnaire : 404 (espace plateforme)', async () => {
      expect((await call('GET', '/platform/plans')).status).toBe(401);
      const subscriber = await login('subscriber', `moussa@test.cotiz.app`);
      expect((await call('GET', '/platform/plans', subscriber)).status).toBe(404);
      const manager = await login('association', `awa@test.cotiz.app`);
      expect((await call('GET', '/platform/plans', manager)).status).toBe(404);
      expect((await create(input('intrus'), manager)).status).toBe(404);
    });

    it('aucune donnée d’association : seulement le nombre d’abonnés', async () => {
      const raw = JSON.stringify(await platformPlans());
      expect(raw).not.toContain(A.id);
      expect(raw).not.toContain('Entraide');
    });
  });

  describe('pf.plan.write (platform.plans.manage, If-Match, audit, plan.updated)', () => {
    it('création : 201, version 1, ETag, journal d’audit et événement plan.updated', async () => {
      const res = await create(input('famille', { features: ['imports', 'contracts'] }));
      expect(res.status).toBe(201);
      expect(res.headers.get('etag')).toBe('W/"1"');
      const plan = Plan.parse(await res.json());
      expect(plan).toMatchObject({
        code: 'famille',
        priceMonthly: xof(5000),
        features: ['imports', 'contracts'],
        isActive: true,
        archivedAt: null,
        subscribersCount: 0,
        version: 1,
      });
      const { rows: audit } = await h.superuser(
        `SELECT action, actor_user_id, actor_role, association_id FROM audit_logs WHERE entity_type = 'plan' AND entity_id = $1`,
        [plan.id],
      );
      expect(audit).toEqual([
        { action: 'plan.create', actor_user_id: OWNER.id, actor_role: 'platform:owner', association_id: null },
      ]);
      const { rows: events } = await h.superuser(
        `SELECT association_id, payload FROM outbox_events WHERE event_type = 'plan.updated' AND aggregate_id = $1`,
        [plan.id],
      );
      expect(events).toEqual([{ association_id: null, payload: { planId: plan.id } }]);
      const { rows } = await h.superuser('SELECT price_monthly, currency FROM plans WHERE id = $1', [plan.id]);
      expect(rows[0]).toEqual({ price_monthly: '5000', currency: 'XOF' });
    });

    it('le support (lecture seule) : 403, rien n’est écrit', async () => {
      const res = await create(input('interdit'), support);
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
      const { rows } = await h.superuser(`SELECT count(*)::int AS n FROM plans WHERE code = 'interdit'`);
      expect(rows[0]).toEqual({ n: 0 });
    });

    it('code déjà pris : 409 code_taken (création comme modification)', async () => {
      expect(await codeOf(await create(input('essentiel')))).toBe('code_taken');
      const res = await patch(PLANS.pro, { code: 'essentiel' }, 1);
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('code_taken');
    });

    it.each([
      ['fonctionnalité non soumise au plan', { features: ['payments'] }, 'features'],
      ['fonctionnalité en double', { features: ['contracts', 'contracts'] }, 'features'],
      ['prix négatif', { priceMonthly: xof(-1) }, 'priceMonthly'],
      [
        'prix hors F CFA (plans en XOF seulement)',
        { priceYearly: { amount: 50000, currency: 'XAF' } },
        'priceYearly.currency',
      ],
      ['montant décimal', { priceMonthly: xof(5000.5) }, 'priceMonthly.amount'],
      ['quota négatif', { limits: { projects: -1, subscribers: 50, managers: 1 } }, 'limits.projects'],
      ['aucun compte gestionnaire', { limits: { projects: 2, subscribers: 50, managers: 0 } }, 'limits.managers'],
    ])('%s : 422 validation_failed sur le champ', async (_why, overrides, field) => {
      const res = await create(input('invalide', overrides));
      expect(res.status).toBe(422);
      const body = (await res.json()) as { code: string; fields?: Record<string, string> };
      expect(body.code).toBe('validation_failed');
      expect(Object.keys(body.fields ?? {})).toContain(field);
    });

    it('modification : If-Match exigé, version incrémentée, seuls les champs envoyés changent', async () => {
      expect((await patch(PLANS.essentiel, { name: 'Essentiel+' }, null)).status).toBe(422);
      const res = await patch(
        PLANS.essentiel,
        { name: 'Essentiel+', limits: { projects: 6, subscribers: 120, managers: 3 } },
        1,
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"2"');
      const plan = Plan.parse(await res.json());
      expect(plan).toMatchObject({
        name: 'Essentiel+',
        limits: { projects: 6, subscribers: 120, managers: 3 },
        priceMonthly: xof(10000),
        features: ['contracts', 'auto_reminders'],
        subscribersCount: 1,
        version: 2,
      });
      const { rows } = await h.superuser(
        `SELECT action, before, after FROM audit_logs WHERE entity_type = 'plan' AND entity_id = $1 AND action = 'plan.update'`,
        [PLANS.essentiel],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ before: { name: 'Essentiel' }, after: { name: 'Essentiel+' } });
    });

    it('version périmée : 412 version_conflict, rien n’est modifié', async () => {
      expect((await patch(PLANS.essentiel, { name: 'v2' }, 1)).status).toBe(200);
      const res = await patch(PLANS.essentiel, { name: 'v3' }, 1);
      expect(res.status).toBe(412);
      expect(await codeOf(res)).toBe('version_conflict');
      const { rows } = await h.superuser('SELECT name, version FROM plans WHERE id = $1', [PLANS.essentiel]);
      expect(rows[0]).toEqual({ name: 'v2', version: 2 });
    });

    it('plans en XOF seulement : un prix dans une autre devise est refusé (422), même les deux', async () => {
      const xaf = (amount: number) => ({ amount, currency: 'XAF' });
      for (const body of [{ priceMonthly: xaf(10000) }, { priceMonthly: xaf(10000), priceYearly: xaf(120000) }]) {
        const res = await patch(PLANS.essentiel, body, 1);
        expect(res.status).toBe(422);
        expect(Object.keys(((await res.json()) as { fields: object }).fields)).toContain('priceMonthly.currency');
      }
      const { rows } = await h.superuser('SELECT currency, version FROM plans WHERE id = $1', [PLANS.essentiel]);
      expect(rows[0]).toEqual({ currency: 'XOF', version: 1 });
      // Hors API aussi : contrainte plans_currency_xof (migration 0010).
      const write = h.superuser(`UPDATE plans SET currency = 'XAF' WHERE id = $1`, [PLANS.essentiel]);
      expect(pgCode(await errorOf(write))).toBe('23514');
    });

    it('désactivé par modification : archivé comme par /archive (mise en avant retirée), hors de pub.plans', async () => {
      const res = await patch(PLANS.essentiel, { isActive: false }, 1);
      const plan = Plan.parse(await res.json());
      expect(plan).toMatchObject({ isActive: false, isFeatured: false, subscribersCount: 1 });
      expect(plan.archivedAt).not.toBeNull();
      expect((await patch(PLANS.essentiel, { isFeatured: true }, 2)).status).toBe(422);
    });

    it('création inactive : archivée d’emblée, jamais publique ; mise en avant d’un plan inactif refusée', async () => {
      const plan = Plan.parse(await (await create(input('reserve', { isActive: false }))).json());
      expect(plan.archivedAt).not.toBeNull();
      expect((await publicPlans()).map((p) => p.code)).not.toContain('reserve');
      expect((await create(input('vitrine', { isActive: false, isFeatured: true }))).status).toBe(422);
    });

    it('corps vide : 422, ni version ni événement', async () => {
      expect((await patch(PLANS.pro, {}, 1)).status).toBe(422);
      const { rows } = await h.superuser('SELECT version FROM plans WHERE id = $1', [PLANS.pro]);
      expect(rows[0]).toEqual({ version: 1 });
    });

    it('plan inconnu : 404', async () => {
      expect((await patch('00000000-0000-7000-8000-0000000c0999', { name: 'x' }, 1)).status).toBe(404);
    });
  });

  describe('pf.plan.archive : archivage (reste appliqué) et duplication', () => {
    it('vérification de l’étape : archivé, il quitte pub.plans mais reste appliqué à ses abonnés', async () => {
      expect((await publicPlans()).map((p) => p.code)).toContain('essentiel');
      const eventsBefore = await planEvents(PLANS.essentiel);
      const res = await call('POST', `/platform/plans/${PLANS.essentiel}/archive`, owner);
      expect(res.status).toBe(200);
      const archived = Plan.parse(await res.json());
      expect(archived).toMatchObject({ isActive: false, isFeatured: false, subscribersCount: 1, version: 2 });
      expect(archived.archivedAt).not.toBeNull();

      await invalidate(PLANS.essentiel);
      expect((await publicPlans()).map((p) => p.code)).toEqual(['decouverte', 'pro']);
      const { rows } = await h.superuser(`SELECT plan_id, status FROM subscriptions WHERE association_id = $1`, [A.id]);
      expect(rows).toEqual([{ plan_id: PLANS.essentiel, status: 'active' }]);
      expect((await platformPlans()).find((p) => p.id === PLANS.essentiel)).toMatchObject({ subscribersCount: 1 });
      expect(await planEvents(PLANS.essentiel)).toBe(eventsBefore + 1);
    });

    it('déjà archivé : 409 invalid_state ; réactivé par modification (isActive), il n’est plus archivé', async () => {
      expect((await call('POST', `/platform/plans/${PLANS.pro}/archive`, owner)).status).toBe(200);
      const again = await call('POST', `/platform/plans/${PLANS.pro}/archive`, owner);
      expect(again.status).toBe(409);
      expect(await codeOf(again)).toBe('invalid_state');
      const res = await patch(PLANS.pro, { isActive: true }, 2);
      expect(Plan.parse(await res.json())).toMatchObject({ isActive: true, archivedAt: null, version: 3 });
    });

    it('duplication : copie active, non mise en avant, code « -copie » puis « -copie-2 »', async () => {
      const first = await call('POST', `/platform/plans/${PLANS.essentiel}/duplicate`, owner);
      expect(first.status).toBe(201);
      const copy = Plan.parse(await first.json());
      expect(copy).toMatchObject({
        code: 'essentiel-copie',
        name: 'Essentiel (copie)',
        priceMonthly: xof(10000),
        limits: { projects: 5, subscribers: 100, managers: 2 },
        features: ['contracts', 'auto_reminders'],
        isFeatured: false,
        isActive: true,
        archivedAt: null,
        subscribersCount: 0,
        version: 1,
      });
      expect(copy.id).not.toBe(PLANS.essentiel);
      const second = Plan.parse(
        await (await call('POST', `/platform/plans/${PLANS.essentiel}/duplicate`, owner)).json(),
      );
      expect(second.code).toBe('essentiel-copie-2');
      const { rows } = await h.superuser(
        `SELECT action FROM audit_logs WHERE entity_type = 'plan' AND entity_id = ANY($1::uuid[]) ORDER BY created_at`,
        [[copy.id, second.id]],
      );
      expect(rows).toEqual([{ action: 'plan.duplicate' }, { action: 'plan.duplicate' }]);
    });

    it('le support : 403 ; plan inconnu : 404', async () => {
      expect((await call('POST', `/platform/plans/${PLANS.pro}/archive`, support)).status).toBe(403);
      expect((await call('POST', `/platform/plans/00000000-0000-7000-8000-0000000c0999/archive`, owner)).status).toBe(
        404,
      );
    });
  });
});
