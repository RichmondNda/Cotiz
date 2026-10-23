import type { INestApplication } from '@nestjs/common';
import { listOf, LoginResponse, PlatformAssociationDetail, PlatformAssociationSummary } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, B, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Lot 1.4 · étape 1 : lecture plateforme des associations (pf.asso.list, pf.asso.get) par la connexion plateforme
 * (cotiz_platform). Vérification de l'étape : tests de permission (le support lit ; hors de l'espace plateforme, 404).
 * Lectures non auditées (endpoints.yaml `audited: false`, ADR 0017).
 */

const PASSWORD = 'Baobab-Lagune-2026';
const STAFF = {
  owner: { id: '00000000-0000-7000-8000-0000000015a1', email: 'richy@cotiz.test', first: 'Richy', last: 'Nda' },
  support: { id: '00000000-0000-7000-8000-0000000015a2', email: 'sali@cotiz.test', first: 'Sali', last: 'Bamba' },
} as const;
const OWNERS = {
  diop: { id: '00000000-0000-7000-8000-0000000015a3', email: 'diop@dakar.sn', first: 'Fatou', last: 'Diop' },
  yao: { id: '00000000-0000-7000-8000-0000000015a4', email: 'yao@bouake.ci', first: 'Yao', last: 'Kouassi' },
} as const;
const PLANS = { essentiel: '00000000-0000-7000-8000-0000000015b1', pro: '00000000-0000-7000-8000-0000000015b2' };
/** Mutuelle de Dakar (suspendue) et Jeunesse solidaire 100% Bouaké (onboarding), en plus de A et B du harnais. */
const C = '00000000-0000-7000-8000-0000000015c1';
const D = '00000000-0000-7000-8000-0000000015c2';
const SUBS = {
  a: '00000000-0000-7000-8000-0000000015d1',
  b: '00000000-0000-7000-8000-0000000015d2',
  c: '00000000-0000-7000-8000-0000000015d3',
  d: '00000000-0000-7000-8000-0000000015d4',
};

const Page = listOf(PlatformAssociationSummary);

describe('lecture plateforme des associations (pf.asso.list, pf.asso.get)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;
  let support: string;
  /** Heure de la connexion d'Awa (gestionnaire de A) : dernière activité de A. */
  let awaLoggedInAfter: Date;

  const call = (path: string, token?: string) =>
    fetch(`${base}${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
  const login = async (space: string, identifier: string) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space, identifier, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return body.accessToken;
  };
  const list = async (query = '', token = support) => {
    const res = await call(`/platform/associations${query}`, token);
    expect(res.status).toBe(200);
    return Page.parse(await res.json());
  };
  const get = async (id: string, token = support) => {
    const res = await call(`/platform/associations/${id}`, token);
    expect(res.status).toBe(200);
    return PlatformAssociationDetail.parse(await res.json());
  };
  const names = (page: { items: { name: string }[] }) => page.items.map((i) => i.name);
  const auditCount = async () =>
    ((await h.superuser('SELECT count(*)::int AS n FROM audit_logs')).rows[0] as { n: number }).n;

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
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
    const config = loadConfig({
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
    support = await login('platform', STAFF.support.email);
    awaLoggedInAfter = new Date(Date.now() - 1000);
    await login('association', 'awa@test.cotiz.app');
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  describe('pf.asso.list', () => {
    it('toutes les associations, la plus ancienne en premier, avec compteurs par statut et par plan', async () => {
      const page = await list();
      expect(names(page)).toEqual([
        'Entraide Yopougon',
        'Ressortissants de Man',
        'Mutuelle de Dakar',
        'Jeunesse solidaire 100% Bouaké',
      ]);
      expect(page.total).toBe(4);
      expect(page.nextCursor).toBeNull();
      expect(page.facets).toEqual({
        status: { onboarding: 1, active: 2, past_due: 0, suspended: 1, closed: 0 },
        plan: { [PLANS.essentiel]: 3, [PLANS.pro]: 1 },
      });
    });

    it('résumé : plan en cours, souscripteurs non retirés, projets, dernière activité d’un gestionnaire', async () => {
      const { items } = await list();
      const a = items.find((i) => i.id === A.id);
      expect(a).toMatchObject({
        slug: 'entraide-yopougon',
        city: 'Abidjan',
        country: 'CI',
        logoFileId: null,
        status: 'active',
        plan: { id: PLANS.essentiel, code: 'essentiel', name: 'Essentiel' },
        projectsCount: 0,
        subscribersCount: 2,
        createdAt: '2026-09-01T08:00:00.000Z',
      });
      expect(new Date(a?.lastActivityAt ?? 0).getTime()).toBeGreaterThanOrEqual(awaLoggedInAfter.getTime());
      // Koffi (B) ne s'est connecté qu'en souscripteur ; la connexion d'Awa, souscriptrice de B, n'est pas une activité de B.
      expect(items.find((i) => i.id === B.id)).toMatchObject({ lastActivityAt: null, subscribersCount: 2 });
    });

    it('filtre par statut : les compteurs par statut restent ceux des autres filtres', async () => {
      const page = await list('?status=active');
      expect(names(page)).toEqual(['Entraide Yopougon', 'Ressortissants de Man']);
      expect(page.total).toBe(2);
      expect(page.facets?.status).toMatchObject({ active: 2, suspended: 1, onboarding: 1 });
      expect(page.facets?.plan).toEqual({ [PLANS.essentiel]: 1, [PLANS.pro]: 1 });
    });

    it('filtre par plan : les compteurs par plan restent ceux des autres filtres', async () => {
      const page = await list(`?planId=${PLANS.pro}`);
      expect(names(page)).toEqual(['Ressortissants de Man']);
      expect(page.facets?.plan).toEqual({ [PLANS.essentiel]: 3, [PLANS.pro]: 1 });
      expect(page.facets?.status).toMatchObject({ active: 1, suspended: 0 });
    });

    it('filtre par pays', async () => {
      expect(names(await list('?country=SN'))).toEqual(['Mutuelle de Dakar']);
    });

    it('recherche par nom ou ville, sans casse ; % est un caractère, pas un joker', async () => {
      expect(names(await list('?q=ENTRAIDE'))).toEqual(['Entraide Yopougon']);
      expect(names(await list('?q=dakar'))).toEqual(['Mutuelle de Dakar']);
      expect(names(await list('?q=abidjan'))).toEqual(['Entraide Yopougon', 'Ressortissants de Man']);
      expect(names(await list(`?q=${encodeURIComponent('100%')}`))).toEqual(['Jeunesse solidaire 100% Bouaké']);
      expect(names(await list(`?q=${encodeURIComponent('%')}`))).toEqual(['Jeunesse solidaire 100% Bouaké']);
    });

    it('pages par curseur, sans doublon ni oubli, dans les deux sens de tri', async () => {
      for (const [sort, expected] of [
        [
          '-createdAt',
          ['Jeunesse solidaire 100% Bouaké', 'Mutuelle de Dakar', 'Ressortissants de Man', 'Entraide Yopougon'],
        ],
        [
          'createdAt',
          ['Entraide Yopougon', 'Ressortissants de Man', 'Mutuelle de Dakar', 'Jeunesse solidaire 100% Bouaké'],
        ],
      ] as const) {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const page: ReturnType<typeof Page.parse> = await list(
            `?limit=3&sort=${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
          );
          expect(page.total).toBe(4);
          seen.push(...names(page));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(expected);
      }
    });

    it('tri inconnu ou curseur illisible : 422 validation_failed', async () => {
      for (const query of ['?sort=name', '?cursor=xyz']) {
        const res = await call(`/platform/associations${query}`, support);
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('validation_failed');
      }
    });
  });

  describe('pf.asso.get', () => {
    it('fiche : profil, abonnement, quotas, équipe, indicateurs, version', async () => {
      const detail = await get(A.id);
      expect(detail).toMatchObject({
        id: A.id,
        name: 'Entraide Yopougon',
        type: 'entraide',
        description: null,
        contactEmail: 'contact@ey.ci',
        contactPhone: '+2250700000000',
        currency: 'XOF',
        timezone: 'Africa/Abidjan',
        status: 'active',
        suspendedAt: null,
        suspensionReason: null,
        owner: { id: USERS.awa, firstName: 'Awa', email: 'awa@test.cotiz.app' },
        managers: [{ id: USERS.awa, role: 'owner' }],
        subscription: {
          id: SUBS.a,
          plan: { id: PLANS.essentiel },
          billingPeriod: 'monthly',
          status: 'active',
          price: { amount: 10000, currency: 'XOF' },
          currentPeriodStart: '2026-10-01',
          currentPeriodEnd: '2026-10-31',
          trialEndsOn: null,
          managerSeatsOverride: null,
        },
        quotas: {
          projects: { used: 0, limit: 5 },
          subscribers: { used: 2, limit: 100 },
          managers: { used: 1, limit: 2 },
        },
        kpi: { activeProjects: 0, subscribers: 2, collectedTotal: { amount: 0, currency: 'XOF' }, recoveryRate: null },
        version: 1,
      });
      expect(new Date(detail.lastActivityAt ?? 0).getTime()).toBeGreaterThanOrEqual(awaLoggedInAfter.getTime());
    });

    it('frise : les actions du journal sur l’association, la plus récente en premier, avec leur auteur', async () => {
      const detail = await get(A.id);
      expect(detail.events).toEqual([
        {
          type: 'association.created',
          at: '2026-09-01T08:00:00.000Z',
          by: { id: STAFF.owner.id, firstName: 'Richy', lastName: 'Nda' },
          detail: null,
        },
      ]);
    });

    it('surcharge des comptes gestionnaires : limite de l’abonnement, pas du plan', async () => {
      const detail = await get(B.id);
      expect(detail.subscription).toMatchObject({ status: 'trialing', managerSeatsOverride: 3 });
      expect(detail.quotas).toEqual({
        projects: { used: 0, limit: null },
        subscribers: { used: 2, limit: 500 },
        managers: { used: 1, limit: 3 },
      });
    });

    it('association suspendue : date et motif', async () => {
      expect(await get(C)).toMatchObject({
        status: 'suspended',
        suspendedAt: '2026-10-20T09:00:00.000Z',
        suspensionReason: 'Abonnement impayé',
        owner: { id: OWNERS.diop.id },
      });
    });

    it('association sans création au journal (seed, reprise) : la frise s’ouvre tout de même sur sa date d’entrée', async () => {
      expect((await get(C)).events).toEqual([
        { type: 'association.created', at: '2026-10-01T08:00:00.000Z', by: null, detail: null },
      ]);
    });

    it('association inconnue : 404 not_found', async () => {
      const res = await call('/platform/associations/00000000-0000-7000-8000-0000000015ff', support);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('permissions (platform.associations.read)', () => {
    it('le support lit la liste et une fiche, sans entrée au journal d’audit', async () => {
      const before = await auditCount();
      expect((await call('/platform/associations', support)).status).toBe(200);
      expect((await call(`/platform/associations/${A.id}`, support)).status).toBe(200);
      expect(await auditCount()).toBe(before);
    });

    it('sans jeton : 401 ; jeton gestionnaire ou souscripteur : 404 (espace plateforme)', async () => {
      expect((await call('/platform/associations')).status).toBe(401);
      expect((await call(`/platform/associations/${A.id}`)).status).toBe(401);
      for (const token of [
        await login('association', 'awa@test.cotiz.app'),
        await login('subscriber', 'moussa@test.cotiz.app'),
      ]) {
        expect((await call('/platform/associations', token)).status).toBe(404);
        expect((await call(`/platform/associations/${A.id}`, token)).status).toBe(404);
      }
    });
  });
});
