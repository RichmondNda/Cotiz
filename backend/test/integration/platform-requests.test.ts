import type { INestApplication } from '@nestjs/common';
import { AssociationRequestDetail, AssociationRequestSummary, listOf, LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Lot 1.3 · étape 4 : file de traitement des demandes (pf.req.list, pf.req.get) par la connexion plateforme
 * (cotiz_platform). Vérification de l'étape : le support lit, ne décide pas (les décisions arrivent aux étapes 5 et 6 ;
 * ici, lecture permise au support et refusée hors de l'espace plateforme).
 */

const PASSWORD = 'Baobab-Lagune-2026';
const STAFF = {
  owner: { id: '00000000-0000-7000-8000-0000000014a1', email: 'richy@cotiz.test', first: 'Richy', last: 'Nda' },
  support: { id: '00000000-0000-7000-8000-0000000014a2', email: 'sali@cotiz.test', first: 'Sali', last: 'Bamba' },
} as const;
const PLANS = { essentiel: '00000000-0000-7000-8000-0000000014b1', pro: '00000000-0000-7000-8000-0000000014b2' };
const REQ = {
  yopougon: '00000000-0000-7000-8000-0000000014c1',
  bouake: '00000000-0000-7000-8000-0000000014c2',
  dakar: '00000000-0000-7000-8000-0000000014c3',
  man: '00000000-0000-7000-8000-0000000014c4',
} as const;

const Page = listOf(AssociationRequestSummary);

describe('file des demandes de création (pf.req.list, pf.req.get)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;
  let owner: string;
  let support: string;

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
    const res = await call(`/platform/association-requests${query}`, token);
    expect(res.status).toBe(200);
    return Page.parse(await res.json());
  };
  const get = async (id: string, token = support) => {
    const res = await call(`/platform/association-requests/${id}`, token);
    expect(res.status).toBe(200);
    return AssociationRequestDetail.parse(await res.json());
  };

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await seedAssociations(h);
    const people = Object.values(STAFF);
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
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now()),
              (gen_random_uuid(), $1, $3, 'owner', 'active', now())`,
      [A.id, USERS.moussa, USERS.awa],
    );
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, '{}'), ($2, 'pro', 'Pro', 25000, 300000, '{}')`,
      [PLANS.essentiel, PLANS.pro],
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
    owner = await login('platform', STAFF.owner.email);
    support = await login('platform', STAFF.support.email);
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await h.superuser('DELETE FROM association_requests');
    // Reçues dans cet ordre : Yopougon (la plus ancienne), Bouaké, Dakar, Man.
    await h.superuser(
      `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
         registration_number, activity_description, contact_first_name, contact_last_name, contact_title,
         contact_email, contact_phone, estimated_subscribers, planned_projects, desired_plan_id, acquisition_source,
         terms_accepted_at, status, decided_by, decided_at, rejection_reason_code, rejection_message, internal_note,
         association_id, created_at)
       VALUES
         ($1, 'DEM-2026-00001', 'Entraide Yopougon', 'association', 'Abidjan', 'CI', 'CI-ABJ-1', 'Entraide',
          'Awa', 'Koné', 'Présidente', 'awa@entraide.ci', '+2250708091011', '51_200', 2, $5, 'Bouche à oreille',
          '2026-10-01T08:00:00Z', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-01T08:00:00Z'),
         ($2, 'DEM-2026-00002', 'Jeunesse solidaire 100% Bouaké', 'tontine', 'Bouaké', 'CI', NULL, 'Tontine',
          'Yao', 'Kouassi', 'Trésorier', 'yao@bouake.ci', '+2250700000002', '21_50', NULL, $6, NULL,
          '2026-10-02T08:00:00Z', 'pending', NULL, NULL, NULL, NULL, NULL, NULL, '2026-10-02T08:00:00Z'),
         ($3, 'DEM-2026-00003', 'Mutuelle de Dakar', 'mutuelle', 'Dakar', 'SN', NULL, 'Mutuelle',
          'Fatou', 'Diop', 'Présidente', 'fatou@dakar.sn', '+221770000003', '201_500', NULL, NULL, NULL,
          '2026-10-03T08:00:00Z', 'approved', $7, '2026-10-05T09:00:00Z', NULL, NULL, 'Client accompagné', $9,
          '2026-10-03T08:00:00Z'),
         ($4, 'DEM-2026-00004', 'Ressortissants de Man', 'association', 'Abidjan', 'CI', NULL, 'Solidarité',
          'Koffi', 'Yao', 'Secrétaire', 'koffi@man.ci', '+2250700000004', '1_20', NULL, NULL, NULL,
          '2026-10-04T08:00:00Z', 'rejected', $8, '2026-10-06T09:00:00Z', 'incomplete', 'Dossier incomplet.',
          NULL, NULL, '2026-10-04T08:00:00Z')`,
      [REQ.yopougon, REQ.bouake, REQ.dakar, REQ.man, PLANS.essentiel, PLANS.pro, STAFF.owner.id, STAFF.owner.id, A.id],
    );
  });

  describe('pf.req.list', () => {
    it('toutes les demandes, la plus ancienne en premier, compteurs par statut', async () => {
      const page = await list();
      expect(page.items.map((r) => r.id)).toEqual([REQ.yopougon, REQ.bouake, REQ.dakar, REQ.man]);
      expect(page.total).toBe(4);
      expect(page.nextCursor).toBeNull();
      expect(page.facets).toEqual({ status: { pending: 2, approved: 1, rejected: 1 } });
    });

    it('résumé : association, responsable, ville, souscripteurs estimés, plan souhaité, date', async () => {
      const [first] = (await list()).items;
      expect(first).toEqual({
        id: REQ.yopougon,
        reference: 'DEM-2026-00001',
        status: 'pending',
        associationName: 'Entraide Yopougon',
        associationType: 'association',
        city: 'Abidjan',
        country: 'CI',
        contact: { firstName: 'Awa', lastName: 'Koné', email: 'awa@entraide.ci' },
        estimatedSubscribers: '51_200',
        desiredPlan: { id: PLANS.essentiel, code: 'essentiel', name: 'Essentiel' },
        createdAt: '2026-10-01T08:00:00.000Z',
      });
    });

    it('onglet « À traiter » : les demandes en attente ; les compteurs restent ceux de tous les statuts', async () => {
      const page = await list('?status=pending');
      expect(page.items.map((r) => r.id)).toEqual([REQ.yopougon, REQ.bouake]);
      expect(page.total).toBe(2);
      expect(page.facets).toEqual({ status: { pending: 2, approved: 1, rejected: 1 } });
    });

    it('statut sans demande : compteur à 0', async () => {
      await h.superuser(`DELETE FROM association_requests WHERE status = 'rejected'`);
      expect((await list()).facets).toEqual({ status: { pending: 2, approved: 1, rejected: 0 } });
    });

    it('recherche par nom ou email, sans casse ; les compteurs suivent la recherche', async () => {
      expect((await list('?q=yopOUGON')).items.map((r) => r.id)).toEqual([REQ.yopougon]);
      expect((await list('?q=FATOU@')).items.map((r) => r.id)).toEqual([REQ.dakar]);
      const page = await list('?q=ci');
      expect(page.items.map((r) => r.id)).toEqual([REQ.yopougon, REQ.bouake, REQ.man]);
      expect(page.facets).toEqual({ status: { pending: 2, approved: 0, rejected: 1 } });
    });

    it('recherche : % et _ sont des caractères, pas des jokers', async () => {
      expect((await list('?q=100%25')).items.map((r) => r.id)).toEqual([REQ.bouake]);
      expect((await list('?q=%25')).items.map((r) => r.id)).toEqual([REQ.bouake]);
      expect((await list('?q=_')).items).toEqual([]);
    });

    it('filtres pays et plan souhaité', async () => {
      expect((await list('?country=SN')).items.map((r) => r.id)).toEqual([REQ.dakar]);
      expect((await list(`?desiredPlanId=${PLANS.pro}`)).items.map((r) => r.id)).toEqual([REQ.bouake]);
      expect((await list(`?status=approved&country=CI`)).items).toEqual([]);
    });

    it('pages par curseur, sans doublon ni oubli, dans les deux sens de tri', async () => {
      for (const [sort, expected] of [
        ['', [REQ.yopougon, REQ.bouake, REQ.dakar, REQ.man]],
        ['&sort=-createdAt', [REQ.man, REQ.dakar, REQ.bouake, REQ.yopougon]],
      ] as const) {
        const seen: string[] = [];
        let cursor: string | null = null;
        do {
          const page = await list(`?limit=3${sort}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
          expect(page.total).toBe(4);
          seen.push(...page.items.map((r) => r.id));
          cursor = page.nextCursor;
        } while (cursor);
        expect(seen).toEqual(expected);
      }
    });

    it('même date de réception : départagées par identifiant, aucune perdue entre deux pages', async () => {
      await h.superuser(`UPDATE association_requests SET created_at = '2026-10-01T08:00:00Z'`);
      const first = await list('?limit=2');
      const second = await list(`?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? '')}`);
      expect([...first.items, ...second.items].map((r) => r.id).sort()).toEqual(Object.values(REQ).sort());
      expect(second.nextCursor).toBeNull();
    });

    it.each([
      ['curseur illisible', '?cursor=pas-un-curseur', 'cursor'],
      ['tri inconnu', '?sort=name', 'sort'],
    ])('%s : 422 validation_failed sur le champ', async (_name, query, field) => {
      const res = await call(`/platform/association-requests${query}`, support);
      expect(res.status).toBe(422);
      const problem = (await res.json()) as { code: string; fields?: Record<string, string> };
      expect(problem.code).toBe('validation_failed');
      expect(Object.keys(problem.fields ?? {})).toEqual([field]);
    });
  });

  describe('pf.req.get', () => {
    it('fiche complète : association, responsable, besoins, CGU, note interne ; frise « reçue »', async () => {
      const detail = await get(REQ.yopougon, owner);
      expect(detail).toMatchObject({
        id: REQ.yopougon,
        association: {
          name: 'Entraide Yopougon',
          type: 'association',
          city: 'Abidjan',
          country: 'CI',
          registrationNumber: 'CI-ABJ-1',
          activityDescription: 'Entraide',
        },
        contact: {
          firstName: 'Awa',
          lastName: 'Koné',
          title: 'Présidente',
          email: 'awa@entraide.ci',
          phone: '+2250708091011',
        },
        needs: {
          estimatedSubscribers: '51_200',
          plannedProjects: 2,
          desiredPlanId: PLANS.essentiel,
          acquisitionSource: 'Bouche à oreille',
        },
        termsAcceptedAt: '2026-10-01T08:00:00.000Z',
        decision: null,
        internalNote: null,
        history: [{ type: 'received', at: '2026-10-01T08:00:00.000Z', by: null }],
      });
    });

    it('première ouverture : « consultée » par la personne et à l’heure de cette ouverture, jamais réécrite', async () => {
      const before = Date.now();
      const first = await get(REQ.yopougon, owner);
      expect(first.viewedBy).toEqual({ id: STAFF.owner.id, firstName: 'Richy', lastName: 'Nda' });
      expect(Date.parse(first.viewedAt ?? '')).toBeGreaterThanOrEqual(before - 1000);
      const again = await get(REQ.yopougon, support);
      expect(again.viewedBy).toEqual(first.viewedBy);
      expect(again.viewedAt).toBe(first.viewedAt);
    });

    it('demande approuvée : décision, association créée, note interne, frise reçue puis approuvée', async () => {
      const detail = await get(REQ.dakar);
      const richy = { id: STAFF.owner.id, firstName: 'Richy', lastName: 'Nda' };
      expect(detail.decision).toEqual({
        decidedAt: '2026-10-05T09:00:00.000Z',
        decidedBy: richy,
        rejectionReasonCode: null,
        rejectionMessage: null,
        associationId: A.id,
      });
      expect(detail.internalNote).toBe('Client accompagné');
      expect(detail.desiredPlan).toBeNull();
      expect(detail.history).toEqual([
        { type: 'received', at: '2026-10-03T08:00:00.000Z', by: null },
        { type: 'approved', at: '2026-10-05T09:00:00.000Z', by: richy },
      ]);
    });

    it('demande refusée : code et message du refus', async () => {
      const detail = await get(REQ.man);
      expect(detail.status).toBe('rejected');
      expect(detail.decision).toMatchObject({
        rejectionReasonCode: 'incomplete',
        rejectionMessage: 'Dossier incomplet.',
      });
      expect(detail.history.map((e) => e.type)).toEqual(['received', 'rejected']);
    });

    it('demande inconnue : 404 not_found', async () => {
      const res = await call(`/platform/association-requests/${crypto.randomUUID()}`, support);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
    });
  });

  describe('permissions (platform.associations.read)', () => {
    it('le support lit la file et une fiche', async () => {
      expect((await call('/platform/association-requests', support)).status).toBe(200);
      expect((await call(`/platform/association-requests/${REQ.yopougon}`, support)).status).toBe(200);
    });

    it('sans jeton : 401 ; jeton gestionnaire ou souscripteur : 404 (espace plateforme), rien n’est marqué consulté', async () => {
      expect((await call('/platform/association-requests')).status).toBe(401);
      for (const token of [
        await login('association', 'awa@test.cotiz.app'),
        await login('subscriber', 'moussa@test.cotiz.app'),
      ]) {
        expect((await call('/platform/association-requests', token)).status).toBe(404);
        expect((await call(`/platform/association-requests/${REQ.yopougon}`, token)).status).toBe(404);
      }
      const row = (await h.superuser('SELECT viewed_at FROM association_requests WHERE id = $1', [REQ.yopougon]))
        .rows[0] as { viewed_at: Date | null };
      expect(row.viewed_at).toBeNull();
    });
  });
});
