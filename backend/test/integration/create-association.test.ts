import type { INestApplication } from '@nestjs/common';
import { AccessToken, AssociationCreated, LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Lot 1.3 · étape 6 : création directe d'une association par la plateforme, sans demande (pf.asso.create), même mise
 * en place que l'approbation (architecture/04 §4.1). Vérification de l'étape : création directe testée.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const NEW_PASSWORD = 'Fromager-Plateau-2026';
const STAFF = {
  owner: { id: '00000000-0000-7000-8000-0000000016a1', email: 'richy@cotiz.test', first: 'Richy', last: 'Nda' },
  support: { id: '00000000-0000-7000-8000-0000000016a2', email: 'sali@cotiz.test', first: 'Sali', last: 'Bamba' },
  admin: { id: '00000000-0000-7000-8000-0000000016a3', email: 'kady@cotiz.test', first: 'Kady', last: 'Touré' },
} as const;
const PLANS = {
  essentiel: '00000000-0000-7000-8000-0000000016b1',
  ancien: '00000000-0000-7000-8000-0000000016b2',
};
const INES = { id: '00000000-0000-7000-8000-0000000016d1', email: 'ines@test.cotiz.app' };
const NEW_EMAIL = 'aya@mutuelle-cocody.ci';

const creation = {
  association: {
    name: 'Mutuelle de Cocody',
    type: 'mutuelle',
    city: 'Abidjan',
    country: 'CI',
    registrationNumber: 'CI-ABJ-2026-200',
    description: 'Mutuelle des enseignants de Cocody.',
  },
  owner: { firstName: 'Aya', lastName: 'Kouadio', email: NEW_EMAIL, phone: '+2250707070707' },
  subscription: { planId: PLANS.essentiel, startsOn: '2026-11-01', managerSeats: null, trialDays: 30 },
  issueCredentialsNow: true,
};

describe('création directe d’une association (pf.asso.create)', () => {
  let h: IsolationHarness;
  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let app: INestApplication;
  let base: string;
  let owner: string;
  let support: string;
  let admin: string;
  let manager: string;

  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await h.superuser(sql, params)).rows as T[];
  const count = async (sql: string, params: unknown[] = []) => Number((await rows<{ n: string }>(sql, params))[0]?.n);
  const associationsCount = () => count(`SELECT count(*) AS n FROM associations`);
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
  let keySeq = 0;
  const newKey = () => `cle-creation-${String(++keySeq).padStart(4, '0')}`;

  const login = async (space: string, identifier: string, password = PASSWORD) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space, identifier, password }),
    });
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return body.accessToken;
  };
  const create = (key: string, body: object = creation, token = owner) =>
    fetch(`${base}/platform/associations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const created = async (res: Response) => {
    expect(res.status).toBe(201);
    return AssociationCreated.parse(await res.json());
  };
  const withOwner = (email: string) => ({ ...creation, owner: { ...creation.owner, email } });

  beforeAll(async () => {
    [h, redisContainer] = await Promise.all([
      startIsolationHarness('migrated'),
      new RedisContainer('redis:7-alpine').start(),
    ]);
    await seedAssociations(h);
    const people = Object.values(STAFF);
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status)
       SELECT id, email, first_name, last_name, 'active'
         FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) AS p(id, email, first_name, last_name)`,
      [people.map((p) => p.id), people.map((p) => p.email), people.map((p) => p.first), people.map((p) => p.last)],
    );
    await h.superuser(
      `INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner'), ($2, 'support'), ($3, 'admin')`,
      [STAFF.owner.id, STAFF.support.id, STAFF.admin.id],
    );
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Inès', 'Test', 'pending_activation')`,
      [INES.id, INES.email],
    );
    const hash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) SELECT id, $1 FROM users`, [hash]);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
         features, is_active)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 100000, 3, 200, 2, '{}', true),
              ($2, 'ancien', 'Ancien', 5000, 60000, 1, 50, 1, '{}', false)`,
      [PLANS.essentiel, PLANS.ancien],
    );
    redis = new Redis(redisContainer.getConnectionUrl());
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redisContainer.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
    });
    app = await createApp(config, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
    owner = await login('platform', STAFF.owner.email);
    support = await login('platform', STAFF.support.email);
    admin = await login('platform', STAFF.admin.email);
  });

  afterAll(async () => {
    redis.disconnect();
    await app.close();
    await Promise.all([h.stop(), redisContainer.stop()]);
  });

  beforeEach(async () => {
    await h.superuser(`DELETE FROM one_time_codes`);
    await h.superuser(`DELETE FROM sessions`);
    await h.superuser(`DELETE FROM memberships`);
    await h.superuser(`DELETE FROM subscriptions`);
    await h.superuser(`DELETE FROM associations WHERE id NOT IN ($1, $2)`, [
      A.id,
      (await rows<{ id: string }>(`SELECT id FROM associations WHERE slug = 'ressortissants-man'`))[0]?.id,
    ]);
    await h.superuser(`DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [NEW_EMAIL]);
    await h.superuser(`DELETE FROM users WHERE email = $1`, [NEW_EMAIL]);
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now()),
              (gen_random_uuid(), $1, $3, 'owner', 'active', now())`,
      [A.id, USERS.moussa, USERS.awa],
    );
    manager = await login('association', 'awa@test.cotiz.app');
  });

  describe('nouveau responsable', () => {
    it('crée l’espace en essai et renvoie la fiche de l’association et le message prêt', async () => {
      const before = await associationsCount();
      const body = await created(await create(newKey()));
      expect(await associationsCount()).toBe(before + 1);

      const [user] = await rows<{ id: string; status: string }>(`SELECT id, status FROM users WHERE email = $1`, [
        NEW_EMAIL,
      ]);
      expect(user?.status).toBe('pending_activation');
      expect(body.association).toMatchObject({
        slug: 'mutuelle-de-cocody',
        name: 'Mutuelle de Cocody',
        type: 'mutuelle',
        city: 'Abidjan',
        country: 'CI',
        description: 'Mutuelle des enseignants de Cocody.',
        contactEmail: NEW_EMAIL,
        contactPhone: '+2250707070707',
        status: 'onboarding',
        currency: 'XOF',
        logoFileId: null,
        suspendedAt: null,
        onboardingCompletedAt: null,
        plan: { id: PLANS.essentiel, code: 'essentiel', name: 'Essentiel' },
        projectsCount: 0,
        subscribersCount: 0,
        owner: { id: user?.id, firstName: 'Aya', lastName: 'Kouadio', email: NEW_EMAIL, phone: '+2250707070707' },
        managers: [{ id: user?.id, role: 'owner' }],
        subscription: {
          plan: { id: PLANS.essentiel },
          billingPeriod: 'monthly',
          status: 'trialing',
          price: { amount: 10000, currency: 'XOF' },
          currentPeriodStart: '2026-11-01',
          // Essai de 30 jours : la période en cours est l'essai (domain-rules § 10).
          currentPeriodEnd: '2026-11-30',
          trialEndsOn: '2026-11-30',
          managerSeatsOverride: null,
        },
        quotas: {
          projects: { used: 0, limit: 3 },
          subscribers: { used: 0, limit: 200 },
          managers: { used: 1, limit: 2 },
        },
        kpi: { activeProjects: 0, subscribers: 0, collectedTotal: { amount: 0, currency: 'XOF' }, recoveryRate: null },
        events: [{ type: 'created', by: { id: STAFF.owner.id }, detail: null }],
        version: 1,
      });
      expect(await rows(`SELECT registration_number FROM associations WHERE id = $1`, [body.association.id])).toEqual([
        { registration_number: 'CI-ABJ-2026-200' },
      ]);
      // Écrit en base comme renvoyé : essai de 30 jours, période en cours = essai, comptes du plan.
      expect(
        await rows(
          `SELECT status, current_period_start::text AS start, current_period_end::text AS end,
                  trial_ends_at::text AS trial, manager_seats_override FROM subscriptions WHERE association_id = $1`,
          [body.association.id],
        ),
      ).toEqual([
        {
          status: 'trialing',
          start: '2026-11-01',
          end: '2026-11-30',
          trial: '2026-11-30',
          manager_seats_override: null,
        },
      ]);

      expect(body.handoff).toMatchObject({
        recipient: { email: NEW_EMAIL, phone: '+2250707070707' },
        activationUrl: 'https://app.cotiz.test/activer?t=%2B2250707070707',
      });
      expect(body.handoff?.message).toContain(body.handoff?.code);
    });

    it('audit association.create et événement association.approved', async () => {
      const body = await created(await create(newKey()));
      const [user] = await rows<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [NEW_EMAIL]);
      expect(
        await rows(
          `SELECT payload FROM outbox_events WHERE event_type = 'association.approved' AND aggregate_id = $1`,
          [body.association.id],
        ),
      ).toEqual([{ payload: { associationId: body.association.id, ownerUserId: user?.id, planId: PLANS.essentiel } }]);
      expect(
        await rows(
          `SELECT entity_type, actor_user_id FROM audit_logs WHERE action = 'association.create' AND entity_id = $1`,
          [body.association.id],
        ),
      ).toEqual([{ entity_type: 'association', actor_user_id: STAFF.owner.id }]);
    });

    it('le gestionnaire active son compte avec le code, puis se connecte', async () => {
      const body = await created(await create(newKey()));
      const res = await fetch(`${base}/auth/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          space: 'association',
          identifier: NEW_EMAIL,
          code: body.handoff?.code,
          newPassword: NEW_PASSWORD,
        }),
      });
      expect(res.status).toBe(200);
      AccessToken.parse(await res.json());
      await login('association', NEW_EMAIL, NEW_PASSWORD);
    });

    it('identifiants plus tard : pas de message dans la réponse, mais le code est émis (chiffré)', async () => {
      const body = await created(await create(newKey(), { ...creation, issueCredentialsNow: false }));
      expect(body.handoff).toBeNull();
      const [user] = await rows<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [NEW_EMAIL]);
      expect(
        await rows(
          `SELECT association_id, issued_by, code_encrypted IS NOT NULL AS sealed FROM one_time_codes WHERE user_id = $1`,
          [user?.id],
        ),
      ).toEqual([{ association_id: null, issued_by: STAFF.owner.id, sealed: true }]);
    });

    it('sans essai, période annuelle, comptes accordés : actif, un an, surcharge', async () => {
      const body = await created(
        await create(newKey(), {
          ...creation,
          subscription: {
            planId: PLANS.essentiel,
            billingPeriod: 'yearly',
            startsOn: '2026-11-15',
            managerSeats: 4,
            trialDays: null,
          },
        }),
      );
      expect(body.association.subscription).toMatchObject({
        billingPeriod: 'yearly',
        status: 'active',
        price: { amount: 100000, currency: 'XOF' },
        currentPeriodEnd: '2027-11-14',
        trialEndsOn: null,
        managerSeatsOverride: 4,
      });
      expect(body.association.quotas.managers).toEqual({ used: 1, limit: 4 });
    });
  });

  describe('comptes gestionnaires', () => {
    it.each([
      ['absent', undefined, null, 2],
      ['égal au plan (2)', 2, null, 2],
      ['4', 4, 4, 4],
    ])('%s → surcharge %s, limite %s', async (_name, managerSeats, override, limit) => {
      const { managerSeats: _seats, ...rest } = creation.subscription;
      const subscription = managerSeats === undefined ? rest : { ...rest, managerSeats };
      const body = await created(await create(newKey(), { ...creation, subscription }));
      expect(body.association.subscription.managerSeatsOverride).toBe(override);
      expect(body.association.quotas.managers).toEqual({ used: 1, limit });
      expect(
        await rows(`SELECT manager_seats_override FROM subscriptions WHERE association_id = $1`, [body.association.id]),
      ).toEqual([{ manager_seats_override: override }]);
    });

    it('essai en période annuelle : la période en cours est l’essai', async () => {
      const body = await created(
        await create(newKey(), { ...creation, subscription: { ...creation.subscription, billingPeriod: 'yearly' } }),
      );
      expect(body.association.subscription).toMatchObject({
        billingPeriod: 'yearly',
        status: 'trialing',
        price: { amount: 100000, currency: 'XOF' },
        currentPeriodEnd: '2026-11-30',
        trialEndsOn: '2026-11-30',
      });
    });
  });

  describe('slug', () => {
    it('choisi et libre : gardé tel quel', async () => {
      const body = await created(
        await create(newKey(), { ...creation, association: { ...creation.association, slug: 'mutuelle-cocody' } }),
      );
      expect(body.association.slug).toBe('mutuelle-cocody');
    });

    it('choisi et déjà pris → 409 slug_taken, rien n’est créé', async () => {
      const before = await associationsCount();
      const res = await create(newKey(), {
        ...creation,
        association: { ...creation.association, slug: 'entraide-yopougon' },
      });
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('slug_taken');
      expect(await associationsCount()).toBe(before);
      expect(await count(`SELECT count(*) AS n FROM users WHERE email = $1`, [NEW_EMAIL])).toBe(0);
    });

    it('déduit d’un nom déjà pris : suffixe', async () => {
      const body = await created(
        await create(newKey(), { ...creation, association: { ...creation.association, name: 'Entraide Yopougon' } }),
      );
      expect(body.association.slug).toBe('entraide-yopougon-2');
    });
  });

  describe('responsable déjà inscrit', () => {
    it('compte actif : rattaché comme owner, aucun code, même avec « identifiants maintenant »', async () => {
      const body = await created(await create(newKey(), withOwner('moussa@test.cotiz.app')));
      expect(body.handoff).toBeNull();
      expect(body.association.owner).toMatchObject({ id: USERS.moussa });
      expect(await count(`SELECT count(*) AS n FROM one_time_codes`)).toBe(0);
    });

    it.each([
      ['owner d’une autre association', 'awa@test.cotiz.app', 'email_already_owner'],
      ['compte pas encore activé', INES.email, 'owner_account_unavailable'],
      ['personnel de la plateforme', STAFF.support.email, 'owner_account_unavailable'],
    ])('%s → 409 %s, rien n’est créé', async (_name, email, code) => {
      const before = await associationsCount();
      const res = await create(newKey(), withOwner(email));
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe(code);
      expect(await associationsCount()).toBe(before);
      expect(await count(`SELECT count(*) AS n FROM one_time_codes`)).toBe(0);
    });

    it('plan inactif → 422 sur subscription.planId', async () => {
      const res = await create(newKey(), {
        ...creation,
        subscription: { ...creation.subscription, planId: PLANS.ancien },
      });
      expect(res.status).toBe(422);
      expect(((await res.json()) as { fields?: Record<string, string> }).fields).toHaveProperty('subscription.planId');
    });
  });

  describe('idempotence', () => {
    it('même clé → un seul espace, la même réponse ; rien du code dans Redis', async () => {
      const key = newKey();
      const before = await associationsCount();
      const first = await created(await create(key));
      const again = await create(key);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await created(again)).toEqual(first);
      expect(await associationsCount()).toBe(before + 1);

      const keys = await redis.keys(`cotiz:idem:*${key}`);
      expect(keys).toHaveLength(1);
      const stored = (await redis.get(keys[0] ?? '')) ?? '';
      expect(stored).not.toContain(first.handoff?.code);
      expect(stored).not.toContain((first.handoff?.code ?? '').replace('-', ''));
      expect(stored).not.toContain(NEW_EMAIL);
    });

    it('même clé, identifiants plus tard : le rejeu ne révèle pas le code', async () => {
      const key = newKey();
      const body = { ...creation, issueCredentialsNow: false };
      const first = await created(await create(key, body));
      expect(await created(await create(key, body))).toEqual(first);
    });

    it('autre clé, même contenu : nouvelle opération, refusée car l’adresse gère déjà l’association créée', async () => {
      await created(await create(newKey()));
      const res = await create(newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('email_already_owner');
    });
  });

  describe('deux personnes de la plateforme', () => {
    it('l’admin crée aussi une association', async () => {
      const body = await created(await create(newKey(), creation, admin));
      expect(body.association.events).toMatchObject([{ type: 'created', by: { id: STAFF.admin.id } }]);
      expect(body.handoff).not.toBeNull();
    });

    it('même clé, même contenu, autre personne : opération distincte, jamais la réponse ni le code du premier', async () => {
      const key = newKey();
      const first = await created(await create(key));
      const other = await create(key, creation, admin);
      expect(other.headers.get('idempotent-replayed')).toBeNull();
      expect(other.status).toBe(409);
      const text = await other.text();
      expect(JSON.parse(text)).toMatchObject({ code: 'email_already_owner' });
      expect(text).not.toContain(first.handoff?.code);
    });
  });

  describe('permissions', () => {
    it('le support ne crée pas → 403 ; jeton gestionnaire → 404 ; rien n’est créé', async () => {
      const before = await associationsCount();
      expect((await create(newKey(), creation, support)).status).toBe(403);
      expect((await create(newKey(), creation, manager)).status).toBe(404);
      expect(await associationsCount()).toBe(before);
    });
  });
});
