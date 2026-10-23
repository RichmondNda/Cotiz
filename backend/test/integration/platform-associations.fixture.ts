import { type INestApplication, Module, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { expect } from 'vitest';
import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { type Config, loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, B, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Jeu des tests plateforme des associations (lot 1.4) : A et B du harnais, une association suspendue (C) et une en
 * onboarding (D), deux plans, leurs abonnements, les équipes, un super-admin owner et un support. Mot de passe commun.
 */

export const PASSWORD = 'Baobab-Lagune-2026';
export const STAFF = {
  owner: { id: '00000000-0000-7000-8000-0000000015a1', email: 'richy@cotiz.test', first: 'Richy', last: 'Nda' },
  support: { id: '00000000-0000-7000-8000-0000000015a2', email: 'sali@cotiz.test', first: 'Sali', last: 'Bamba' },
} as const;
export const OWNERS = {
  diop: { id: '00000000-0000-7000-8000-0000000015a3', email: 'diop@dakar.sn', first: 'Fatou', last: 'Diop' },
  yao: { id: '00000000-0000-7000-8000-0000000015a4', email: 'yao@bouake.ci', first: 'Yao', last: 'Kouassi' },
} as const;
export const PLANS = { essentiel: '00000000-0000-7000-8000-0000000015b1', pro: '00000000-0000-7000-8000-0000000015b2' };
/** Mutuelle de Dakar (suspendue) et Jeunesse solidaire 100% Bouaké (onboarding), en plus de A et B du harnais. */
export const C = '00000000-0000-7000-8000-0000000015c1';
export const D = '00000000-0000-7000-8000-0000000015c2';
export const SUBS = {
  a: '00000000-0000-7000-8000-0000000015d1',
  b: '00000000-0000-7000-8000-0000000015d2',
  c: '00000000-0000-7000-8000-0000000015d3',
  d: '00000000-0000-7000-8000-0000000015d4',
};

export interface PlatformFixture {
  h: IsolationHarness;
  redis: StartedRedisContainer;
  app: INestApplication;
  base: string;
  /** Requête JSON, avec jeton et en-têtes facultatifs. */
  call: (
    path: string,
    options?: { token?: string; method?: string; body?: unknown; headers?: Record<string, string> },
  ) => Promise<Response>;
  login: (space: string, identifier: string) => Promise<string>;
  config: Config;
  stop: () => Promise<void>;
}

export const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

/** Base migrée, jeu de référence, api réelle sur un port libre ; `controllers` : routes de test en plus (sondes). */
export async function startPlatformFixture(controllers: Type[] = []): Promise<PlatformFixture> {
  const [h, redis] = await Promise.all([
    startIsolationHarness('migrated'),
    new RedisContainer('redis:7-alpine').start(),
  ]);
  await seedPlatformAssociations(h);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: h.db.urlFor('cotiz_app'),
    PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
    REDIS_URL: redis.getConnectionUrl(),
    S3_ENDPOINT: 'http://127.0.0.1:1',
    RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
    RATE_LIMIT_IP_PER_MIN: '10000',
  });
  @Module({ imports: [AppModule.register(config)], controllers })
  class TestRoot {}
  const app = await NestFactory.create(TestRoot, { logger: false, abortOnError: false });
  configureApp(app, config);
  await app.listen(0, '127.0.0.1');
  const base = `${await app.getUrl()}/api/v1`;

  const call: PlatformFixture['call'] = (path, options = {}) =>
    fetch(`${base}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
  const login = async (space: string, identifier: string) => {
    const res = await call('/auth/login', { method: 'POST', body: { space, identifier, password: PASSWORD } });
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return body.accessToken;
  };
  return {
    h,
    redis,
    app,
    base,
    call,
    login,
    config,
    stop: async () => {
      await app.close();
      await Promise.all([h.stop(), redis.stop()]);
    },
  };
}

async function seedPlatformAssociations(h: IsolationHarness): Promise<void> {
  await seedAssociations(h);
  const people = [...Object.values(STAFF), ...Object.values(OWNERS)];
  await h.superuser(
    `INSERT INTO users (id, email, first_name, last_name, status)
     SELECT id, email, first_name, last_name, 'active'
       FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[]) AS p(id, email, first_name, last_name)`,
    [people.map((p) => p.id), people.map((p) => p.email), people.map((p) => p.first), people.map((p) => p.last)],
  );
  await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner'), ($2, 'support')`, [
    STAFF.owner.id,
    STAFF.support.id,
  ]);
  const hash = await new SecretHasher().hash(PASSWORD);
  await h.superuser(`INSERT INTO credentials (user_id, password_hash) SELECT id, $1 FROM users`, [hash]);
  // Entrées : A le 1er sept., B le 15 sept., C le 1er oct., D le 10 oct. 2026.
  await h.superuser(
    `UPDATE associations SET created_at = CASE id WHEN $1::uuid THEN timestamptz '2026-09-01T08:00:00Z'
                                                  ELSE timestamptz '2026-09-15T08:00:00Z' END`,
    [A.id],
  );
  await h.superuser(
    `INSERT INTO associations (id, slug, name, type, city, country, contact_email, contact_phone, status,
       suspended_at, suspension_reason, created_at) VALUES
       ($1, 'mutuelle-dakar', 'Mutuelle de Dakar', 'mutuelle', 'Dakar', 'SN', 'contact@dakar.sn', '+221770000003',
        'suspended', '2026-10-20T09:00:00Z', 'Abonnement impayé', '2026-10-01T08:00:00Z'),
       ($2, 'jeunesse-bouake', 'Jeunesse solidaire 100% Bouaké', 'tontine', 'Bouaké', 'CI', 'contact@bouake.ci',
        '+2250700000002', 'onboarding', NULL, NULL, '2026-10-10T08:00:00Z')`,
    [C, D],
  );
  await h.superuser(
    `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_projects, max_subscribers, max_managers,
       features)
     VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, 5, 100, 2, '{}'),
            ($2, 'pro', 'Pro', 25000, 300000, NULL, 500, 5, '{}')`,
    [PLANS.essentiel, PLANS.pro],
  );
  await h.superuser(
    `INSERT INTO subscriptions (id, association_id, plan_id, billing_period, status, current_period_start,
       current_period_end, trial_ends_at, manager_seats_override) VALUES
       ($1, $5, $9, 'monthly', 'active', '2026-10-01', '2026-10-31', NULL, NULL),
       ($2, $6, $10, 'yearly', 'trialing', '2026-09-15', '2026-10-14', '2026-10-14', 3),
       ($3, $7, $9, 'monthly', 'active', '2026-10-01', '2026-10-31', NULL, NULL),
       ($4, $8, $9, 'monthly', 'trialing', '2026-10-10', '2026-11-08', '2026-11-08', NULL)`,
    [SUBS.a, SUBS.b, SUBS.c, SUBS.d, A.id, B.id, C, D, PLANS.essentiel, PLANS.pro],
  );
  await h.superuser(
    `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at) VALUES
       (gen_random_uuid(), $1, $3, 'owner', 'active', '2026-09-01T08:00:00Z'),
       (gen_random_uuid(), $1, $4, 'subscriber', 'active', now()),
       (gen_random_uuid(), $1, $5, 'subscriber', 'active', now()),
       (gen_random_uuid(), $1, $6, 'subscriber', 'removed', now()),
       (gen_random_uuid(), $2, $7, 'owner', 'active', now()),
       (gen_random_uuid(), $2, $8, 'subscriber', 'active', now()),
       (gen_random_uuid(), $2, $3, 'subscriber', 'active', now()),
       (gen_random_uuid(), $9, $10, 'owner', 'active', now()),
       (gen_random_uuid(), $11, $12, 'owner', 'active', now())`,
    [
      A.id,
      B.id,
      USERS.awa,
      USERS.moussa,
      USERS.aminata,
      USERS.fatou,
      USERS.koffi,
      USERS.fatou,
      C,
      OWNERS.diop.id,
      D,
      OWNERS.yao.id,
    ],
  );
  // Frise de A : création par le super-admin, puis une action d'une autre association (jamais reprise).
  await h.superuser(
    `INSERT INTO audit_logs (occurred_at, actor_user_id, actor_role, association_id, action, entity_type, entity_id)
     VALUES ('2026-09-01T08:00:00Z', $1, 'platform:owner', $2, 'association.create', 'association', $2),
            ('2026-09-15T08:00:00Z', $1, 'platform:owner', $3, 'association.create', 'association', $3),
            ('2026-09-02T08:00:00Z', $1, 'platform:owner', $2, 'plan.update', 'plan', $4)`,
    [STAFF.owner.id, A.id, B.id, PLANS.essentiel],
  );
  // Koffi (owner de B) connecté dans un autre espace que l'espace association : pas une activité de B.
  await h.superuser(
    `INSERT INTO sessions (id, user_id, refresh_token_hash, family_id, space, created_at, last_used_at, expires_at)
     VALUES (gen_random_uuid(), $1, 'x', gen_random_uuid(), 'subscriber', now(), now(), now() + interval '1 day')`,
    [USERS.koffi],
  );
}
