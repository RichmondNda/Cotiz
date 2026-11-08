import type { INestApplication } from '@nestjs/common';
import { AccessToken, AssociationRequestDetail, LoginResponse, RequestApproved } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { Redis } from 'ioredis';
import { associations, memberships, subscriptions } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import {
  A,
  asManagerOf,
  B,
  type IsolationHarness,
  seedAssociations,
  startIsolationHarness,
  type Tx,
  USERS,
} from '../isolation/harness.js';

/**
 * Lot 1.3 · étapes 5 et 6 : décision sur une demande, par la connexion plateforme. Approbation (pf.req.approve,
 * architecture/04 §4.1) — vérification : approuver deux fois → un seul espace ; le gestionnaire active son compte avec
 * le code et se connecte. Refus (pf.req.reject) — vérification : impossible de refuser une demande approuvée.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const NEW_PASSWORD = 'Fromager-Plateau-2026';
const STAFF = {
  owner: { id: '00000000-0000-7000-8000-0000000015a1', email: 'richy@cotiz.test', first: 'Richy', last: 'Nda' },
  support: { id: '00000000-0000-7000-8000-0000000015a2', email: 'sali@cotiz.test', first: 'Sali', last: 'Bamba' },
  admin: { id: '00000000-0000-7000-8000-0000000015a3', email: 'kady@cotiz.test', first: 'Kady', last: 'Touré' },
} as const;
const PLANS = {
  essentiel: '00000000-0000-7000-8000-0000000015b1',
  pro: '00000000-0000-7000-8000-0000000015b2',
  ancien: '00000000-0000-7000-8000-0000000015b3',
  illimite: '00000000-0000-7000-8000-0000000015b4',
};
const REQ = {
  yopougon: '00000000-0000-7000-8000-0000000015c1',
  moussa: '00000000-0000-7000-8000-0000000015c2',
  awa: '00000000-0000-7000-8000-0000000015c3',
  rejected: '00000000-0000-7000-8000-0000000015c4',
} as const;
const UNKNOWN = '00000000-0000-7000-8000-0000000015ff';
/** Souscripteur de A pas encore activé : son code d'activation a été émis par A. */
const INES = { id: '00000000-0000-7000-8000-0000000015d1', email: 'ines@test.cotiz.app' };
const EXTRA_REQUEST = '00000000-0000-7000-8000-0000000015c9';
const NEW_EMAIL = 'adjoua@entraide.ci';

const decision = {
  planId: PLANS.essentiel,
  managerSeats: 3,
  subscriptionStartsOn: '2026-11-01',
  internalNote: 'Appel du 20 octobre : 60 familles.',
  personalMessage: 'Bienvenue sur Cotiz !',
};

const refusal = { reasonCode: 'incomplete', message: 'Merci de joindre vos statuts et de renvoyer la demande.' };

describe('décision sur une demande (pf.req.approve, pf.req.reject)', () => {
  let h: IsolationHarness;
  let redisContainer: StartedRedisContainer;
  let redis: Redis;
  let app: INestApplication;
  let base: string;
  let owner: string;
  let support: string;
  let admin: string;
  let manager: string;

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
  const approve = (id: string, key: string, token = owner, body: object = decision) =>
    fetch(`${base}/platform/association-requests/${id}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  const approved = async (res: Response) => {
    expect(res.status).toBe(200);
    return RequestApproved.parse(await res.json());
  };
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await h.superuser(sql, params)).rows as T[];
  const count = async (sql: string, params: unknown[] = []) => Number((await rows<{ n: string }>(sql, params))[0]?.n);
  const associationsCount = () => count(`SELECT count(*) AS n FROM associations`);
  /** Demande en attente au nom d'une adresse donnée (autre que celles du jeu de départ). */
  const requestFor = (email: string, phone = '+2250700000099', id = EXTRA_REQUEST) =>
    h.superuser(
      `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
         activity_description, contact_first_name, contact_last_name, contact_title, contact_email, contact_phone,
         estimated_subscribers, terms_accepted_at, status, created_at)
       VALUES ($1, $4, 'Cercle des amis', 'association', 'Abidjan', 'CI',
         'Amitié.', 'Prénom', 'Nom', 'Président', $2, $3, '1_20', now(), 'pending', now())`,
      [id, email, phone, `DEM-2026-9${id.slice(-4)}`],
    );
  const reject = (id: string, key: string, token = owner, body: object = refusal) =>
    fetch(`${base}/platform/association-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': key },
      body: JSON.stringify(body),
    });
  let keySeq = 0;
  const newKey = () => `cle-approbation-${String(++keySeq).padStart(4, '0')}`;

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
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, max_managers, features, is_active)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, 2, '{}', true),
              ($2, 'pro', 'Pro', 25000, 300000, 5, '{}', true),
              ($3, 'ancien', 'Ancien', 5000, 60000, 1, '{}', false),
              ($4, 'illimite', 'Illimité', 50000, 600000, NULL, '{}', true)`,
      [PLANS.essentiel, PLANS.pro, PLANS.ancien, PLANS.illimite],
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
    // Chaque test repart des associations A et B : Awa owner de A, Moussa souscripteur de A (compte actif).
    await h.superuser(`DELETE FROM association_requests`);
    await h.superuser(`DELETE FROM one_time_codes`);
    await h.superuser(`DELETE FROM sessions`);
    await h.superuser(`DELETE FROM memberships`);
    await h.superuser(`DELETE FROM subscriptions`);
    // Par identifiant : « les deux plus anciennes » dépendait de l'ordre des created_at (aléa constaté sous charge).
    await h.superuser(`DELETE FROM associations WHERE id NOT IN ($1, $2)`, [A.id, B.id]);
    await h.superuser(`DELETE FROM credentials WHERE user_id IN (SELECT id FROM users WHERE email = $1)`, [NEW_EMAIL]);
    await h.superuser(`DELETE FROM users WHERE email = $1`, [NEW_EMAIL]);
    await h.superuser(`UPDATE users SET status = 'active' WHERE id = $1`, [USERS.koffi]);
    await h.superuser(`UPDATE users SET phone_e164 = NULL WHERE id = $1`, [USERS.moussa]);
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
       VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now()),
              (gen_random_uuid(), $1, $3, 'owner', 'active', now()),
              (gen_random_uuid(), $1, $4, 'subscriber', 'invited', NULL)`,
      [A.id, USERS.moussa, USERS.awa, INES.id],
    );
    await h.superuser(
      `INSERT INTO one_time_codes (id, user_id, purpose, delivery, code_hash, expires_at, association_id, issued_by)
       VALUES (gen_random_uuid(), $1, 'activation', 'manual', 'haché', now() + interval '3 days', $2, $3)`,
      [INES.id, A.id, USERS.awa],
    );
    await h.superuser(
      `INSERT INTO association_requests (id, reference, association_name, association_type, city, country,
         registration_number, activity_description, contact_first_name, contact_last_name, contact_title,
         contact_email, contact_phone, estimated_subscribers, desired_plan_id, terms_accepted_at, status,
         decided_by, decided_at, rejection_reason_code, created_at)
       VALUES
         ($1, 'DEM-2026-00011', 'Entraide Yopougon', 'association', 'Abidjan', 'CI', 'CI-ABJ-2026-117',
          'Entraide entre familles.', 'Adjoua', 'Koné', 'Présidente', $6, '+2250708091099', '51_200', $5,
          '2026-10-01T08:00:00Z', 'pending', NULL, NULL, NULL, '2026-10-01T08:00:00Z'),
         ($2, 'DEM-2026-00012', 'Tontine du Plateau', 'tontine', 'Abidjan', 'CI', NULL, 'Tontine.',
          'Moussa', 'Test', 'Trésorier', 'moussa@test.cotiz.app', '+2250700000012', '21_50', NULL,
          '2026-10-02T08:00:00Z', 'pending', NULL, NULL, NULL, '2026-10-02T08:00:00Z'),
         ($3, 'DEM-2026-00013', 'Mutuelle de Cocody', 'mutuelle', 'Abidjan', 'CI', NULL, 'Mutuelle.',
          'Awa', 'Test', 'Présidente', 'awa@test.cotiz.app', '+2250700000013', '21_50', NULL,
          '2026-10-03T08:00:00Z', 'pending', NULL, NULL, NULL, '2026-10-03T08:00:00Z'),
         ($4, 'DEM-2026-00014', 'Ressortissants de Man', 'association', 'Abidjan', 'CI', NULL, 'Solidarité.',
          'Koffi', 'Yao', 'Secrétaire', 'koffi@man.ci', '+2250700000014', '1_20', NULL,
          '2026-10-04T08:00:00Z', 'rejected', $7, '2026-10-06T09:00:00Z', 'incomplete', '2026-10-04T08:00:00Z')`,
      [REQ.yopougon, REQ.moussa, REQ.awa, REQ.rejected, PLANS.essentiel, NEW_EMAIL, STAFF.owner.id],
    );
    manager = await login('association', 'awa@test.cotiz.app');
  });

  describe('nouveau responsable', () => {
    it('crée l’espace, l’abonnement, le compte, l’appartenance owner et renvoie le message prêt', async () => {
      const before = await associationsCount();
      const body = await approved(await approve(REQ.yopougon, newKey()));

      expect(await associationsCount()).toBe(before + 1);
      const [association] = await rows(
        `SELECT slug, name, type, city, country, registration_number, description, contact_email, contact_phone, status
           FROM associations WHERE id = $1`,
        [body.associationId],
      );
      // « entraide-yopougon » est déjà pris par A : suffixe -2.
      expect(association).toEqual({
        slug: 'entraide-yopougon-2',
        name: 'Entraide Yopougon',
        type: 'association',
        city: 'Abidjan',
        country: 'CI',
        registration_number: 'CI-ABJ-2026-117',
        description: 'Entraide entre familles.',
        contact_email: NEW_EMAIL,
        contact_phone: '+2250708091099',
        status: 'onboarding',
      });

      const subscriptions = await rows(
        `SELECT plan_id, billing_period, status, current_period_start::text AS start, current_period_end::text AS end,
                trial_ends_at, manager_seats_override
           FROM subscriptions WHERE association_id = $1`,
        [body.associationId],
      );
      expect(subscriptions).toEqual([
        {
          plan_id: PLANS.essentiel,
          billing_period: 'monthly',
          status: 'active',
          start: '2026-11-01',
          end: '2026-11-30',
          trial_ends_at: null,
          // 3 comptes accordés, le plan en prévoit 2.
          manager_seats_override: 3,
        },
      ]);

      const [user] = await rows<{ id: string; status: string; first_name: string; phone_e164: string }>(
        `SELECT id, status, first_name, phone_e164 FROM users WHERE email = $1`,
        [NEW_EMAIL],
      );
      expect(user).toMatchObject({ status: 'pending_activation', first_name: 'Adjoua', phone_e164: '+2250708091099' });
      expect(
        await rows(`SELECT role, status FROM memberships WHERE association_id = $1 AND user_id = $2`, [
          body.associationId,
          user?.id,
        ]),
      ).toEqual([{ role: 'owner', status: 'active' }]);

      expect(body.request).toMatchObject({
        id: REQ.yopougon,
        status: 'approved',
        internalNote: decision.internalNote,
        decision: { decidedBy: { id: STAFF.owner.id }, associationId: body.associationId, rejectionReasonCode: null },
      });
      expect(body.request.history.map((e) => e.type)).toEqual(['received', 'approved']);

      expect(body.handoff).not.toBeNull();
      expect(body.handoff).toMatchObject({
        recipient: { firstName: 'Adjoua', lastName: 'Koné', email: NEW_EMAIL, phone: '+2250708091099' },
        activationUrl: 'https://app.cotiz.test/activer?espace=association',
      });
      expect(body.handoff?.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(body.handoff?.message).toContain(body.handoff?.code);
      expect(body.handoff?.message).toContain('votre espace association');
      expect(body.handoff?.message).toContain(decision.personalMessage);
      expect(body.handoff?.mailtoUrl).toMatch(/^mailto:adjoua@entraide\.ci\?/);
      expect(body.handoff?.whatsappUrl).toMatch(/^https:\/\/wa\.me\/2250708091099\?text=/);

      // Code émis par la plateforme, hors association (absent des « codes à remettre » d'un espace), chiffré pour le
      // rejeu, haché pour la vérification.
      expect(
        await rows(
          `SELECT purpose, association_id, issued_by, code_encrypted IS NOT NULL AS sealed
             FROM one_time_codes WHERE user_id = $1`,
          [user?.id],
        ),
      ).toEqual([{ purpose: 'activation', association_id: null, issued_by: STAFF.owner.id, sealed: true }]);
    });

    it('audit et événement association.approved dans la même transaction', async () => {
      const body = await approved(await approve(REQ.yopougon, newKey()));
      const [user] = await rows<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [NEW_EMAIL]);
      expect(
        await rows(
          `SELECT payload FROM outbox_events WHERE event_type = 'association.approved' AND aggregate_id = $1`,
          [body.associationId],
        ),
      ).toEqual([{ payload: { associationId: body.associationId, ownerUserId: user?.id, planId: PLANS.essentiel } }]);
      const audit = await rows<{ entity_type: string; actor_user_id: string; association_id: string }>(
        `SELECT entity_type, actor_user_id, association_id FROM audit_logs
          WHERE action = 'association_request.approve' AND entity_id = $1 AND association_id = $2`,
        [REQ.yopougon, body.associationId],
      );
      expect(audit).toEqual([
        { entity_type: 'association_request', actor_user_id: STAFF.owner.id, association_id: body.associationId },
      ]);
      // Le code n'apparaît nulle part en clair : ni l'audit, ni les événements.
      const traces = JSON.stringify([
        await rows(`SELECT before, after FROM audit_logs`),
        await rows(`SELECT payload FROM outbox_events`),
      ]);
      expect(traces).not.toContain(body.handoff?.code);
    });

    it('vérification : le gestionnaire active son compte avec le code, puis se connecte à son espace', async () => {
      const body = await approved(await approve(REQ.yopougon, newKey()));
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

      const token = await login('association', NEW_EMAIL, NEW_PASSWORD);
      const me = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token}` } });
      expect(me.status).toBe(200);
      const memberships = ((await me.json()) as { memberships: { association: { id: string }; role: string }[] })
        .memberships;
      expect(memberships).toHaveLength(1);
      expect(memberships).toMatchObject([{ association: { id: body.associationId }, role: 'owner' }]);
    });
  });

  describe('idempotence', () => {
    it('vérification : approuver deux fois avec la même clé → un seul espace, la même réponse', async () => {
      const key = newKey();
      const before = await associationsCount();
      const first = await approved(await approve(REQ.yopougon, key));
      const again = await approve(REQ.yopougon, key);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await approved(again)).toEqual(first);
      expect(await associationsCount()).toBe(before + 1);
      expect(await count(`SELECT count(*) AS n FROM one_time_codes WHERE association_id IS NULL`)).toBe(1);
    });

    it('la réponse mémorisée (Redis) ne contient pas le code d’activation', async () => {
      const key = newKey();
      const first = await approved(await approve(REQ.yopougon, key));
      const keys = await redis.keys(`cotiz:idem:*${key}`);
      expect(keys).toHaveLength(1);
      const stored = (await redis.get(keys[0] ?? '')) ?? '';
      expect(stored).toContain('"done"');
      expect(stored).not.toContain(first.handoff?.code);
      expect(stored).not.toContain((first.handoff?.code ?? '').replace('-', ''));
    });

    it('rejeu après l’activation : le code consommé n’est plus servi (handoff null)', async () => {
      const key = newKey();
      const first = await approved(await approve(REQ.yopougon, key));
      const activated = await fetch(`${base}/auth/activate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          space: 'association',
          identifier: NEW_EMAIL,
          code: first.handoff?.code,
          newPassword: NEW_PASSWORD,
        }),
      });
      expect(activated.status).toBe(200);
      const replay = await approved(await approve(REQ.yopougon, key));
      expect(replay).toEqual({ ...first, handoff: null });
    });

    it('même clé, autre décision → 422 idempotency_key_reused', async () => {
      const key = newKey();
      await approved(await approve(REQ.yopougon, key));
      const res = await approve(REQ.yopougon, key, owner, { ...decision, managerSeats: 4 });
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('idempotency_key_reused');
    });

    it('autre clé sur une demande approuvée → 409 request_already_handled, rien de plus', async () => {
      await approved(await approve(REQ.yopougon, newKey()));
      const before = await associationsCount();
      const res = await approve(REQ.yopougon, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('request_already_handled');
      expect(await associationsCount()).toBe(before);
    });

    it('deux approbations simultanées (clés différentes) : une seule réussit', async () => {
      const before = await associationsCount();
      const results = await Promise.all([approve(REQ.yopougon, newKey()), approve(REQ.yopougon, newKey())]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await associationsCount()).toBe(before + 1);
    });

    it('demande refusée → 409 request_already_handled', async () => {
      const res = await approve(REQ.rejected, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('request_already_handled');
    });
  });

  describe('responsable déjà inscrit', () => {
    it('compte actif (souscripteur ailleurs) : rattaché comme owner, aucun code (handoff null)', async () => {
      const body = await approved(await approve(REQ.moussa, newKey()));
      expect(body.handoff).toBeNull();
      expect(
        await rows(`SELECT role, status FROM memberships WHERE association_id = $1 AND user_id = $2`, [
          body.associationId,
          USERS.moussa,
        ]),
      ).toEqual([{ role: 'owner', status: 'active' }]);
      expect(await count(`SELECT count(*) AS n FROM one_time_codes WHERE association_id IS NULL`)).toBe(0);
      expect(await count(`SELECT count(*) AS n FROM users WHERE email = 'moussa@test.cotiz.app'`)).toBe(1);
      // Il se connecte déjà avec son mot de passe : son nouvel espace lui est ouvert.
      await login('association', 'moussa@test.cotiz.app');
    });

    it.each([
      ['compte pas encore activé (souscripteur de A)', INES.email],
      ['compte verrouillé', 'koffi@test.cotiz.app'],
      ['personnel de la plateforme', STAFF.support.email],
    ])('%s → 409 owner_account_unavailable, aucun code émis, rien n’est créé', async (_name, email) => {
      await h.superuser(`UPDATE users SET status = 'locked' WHERE id = $1`, [USERS.koffi]);
      await requestFor(email);
      const codes = await rows(`SELECT id, expires_at, code_hash FROM one_time_codes ORDER BY id`);
      const before = await associationsCount();
      const res = await approve(EXTRA_REQUEST, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('owner_account_unavailable');
      expect(await associationsCount()).toBe(before);
      // Le code d'Inès émis par A est intact : rien ne le remplace.
      expect(await rows(`SELECT id, expires_at, code_hash FROM one_time_codes ORDER BY id`)).toEqual(codes);
      expect(await rows(`SELECT status FROM association_requests WHERE id = $1`, [EXTRA_REQUEST])).toEqual([
        { status: 'pending' },
      ]);
    });

    it('deux demandes de la même adresse approuvées en même temps : une seule réussit (409 email_already_owner)', async () => {
      await requestFor(NEW_EMAIL);
      const before = await associationsCount();
      const results = await Promise.all([approve(REQ.yopougon, newKey()), approve(EXTRA_REQUEST, newKey())]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      const refused = results.find((r) => r.status === 409);
      expect(refused && (await codeOf(refused))).toBe('email_already_owner');
      expect(await associationsCount()).toBe(before + 1);
      expect(await count(`SELECT count(*) AS n FROM users WHERE email = $1`, [NEW_EMAIL])).toBe(1);
    });

    it('téléphone déjà celui d’un autre compte : compte créé sans téléphone, message par email seulement', async () => {
      await h.superuser(`UPDATE users SET phone_e164 = '+2250708091099' WHERE id = $1`, [USERS.moussa]);
      const body = await approved(await approve(REQ.yopougon, newKey()));
      expect(await rows(`SELECT phone_e164 FROM users WHERE email = $1`, [NEW_EMAIL])).toEqual([{ phone_e164: null }]);
      expect(body.handoff).toMatchObject({ recipient: { email: NEW_EMAIL, phone: null }, whatsappUrl: null });
      expect(body.handoff?.mailtoUrl).toMatch(/^mailto:/);
    });

    it('owner d’une autre association → 409 email_already_owner, rien n’est créé', async () => {
      const before = await associationsCount();
      const res = await approve(REQ.awa, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('email_already_owner');
      expect(await associationsCount()).toBe(before);
      expect(await count(`SELECT count(*) AS n FROM subscriptions`)).toBe(0);
      expect(await rows(`SELECT status FROM association_requests WHERE id = $1`, [REQ.awa])).toEqual([
        { status: 'pending' },
      ]);
    });
  });

  describe('décision', () => {
    it('période annuelle, comptes du plan : pas de surcharge, fin de période un an plus tard', async () => {
      const body = await approved(
        await approve(REQ.yopougon, newKey(), owner, {
          planId: PLANS.pro,
          billingPeriod: 'yearly',
          managerSeats: 5,
          subscriptionStartsOn: '2026-11-15',
        }),
      );
      expect(
        await rows(
          `SELECT billing_period, current_period_end::text AS end, manager_seats_override
             FROM subscriptions WHERE association_id = $1`,
          [body.associationId],
        ),
      ).toEqual([{ billing_period: 'yearly', end: '2027-11-14', manager_seats_override: null }]);
      expect(body.request.internalNote).toBeNull();
    });

    it.each([
      ['absent, plan à 2 comptes', PLANS.essentiel, undefined, null],
      ['null, plan à 2 comptes', PLANS.essentiel, null, null],
      ['absent, plan illimité', PLANS.illimite, undefined, null],
      ['4, plan illimité', PLANS.illimite, 4, 4],
    ])('comptes gestionnaires %s → surcharge %s', async (_name, planId, managerSeats, override) => {
      const { managerSeats: _seats, ...rest } = decision;
      const input = managerSeats === undefined ? { ...rest, planId } : { ...rest, planId, managerSeats };
      const body = await approved(await approve(REQ.yopougon, newKey(), owner, input));
      expect(
        await rows(`SELECT manager_seats_override FROM subscriptions WHERE association_id = $1`, [body.associationId]),
      ).toEqual([{ manager_seats_override: override }]);
    });

    it.each([
      ['plan inconnu', UNKNOWN],
      ['plan inactif', PLANS.ancien],
    ])('%s → 422 sur planId, rien n’est créé', async (_name, planId) => {
      const before = await associationsCount();
      const res = await approve(REQ.yopougon, newKey(), owner, { ...decision, planId });
      expect(res.status).toBe(422);
      expect(((await res.json()) as { fields?: Record<string, string> }).fields).toHaveProperty('planId');
      expect(await associationsCount()).toBe(before);
    });

    it('demande inconnue → 404', async () => {
      const res = await approve(UNKNOWN, newKey());
      expect(res.status).toBe(404);
    });
  });

  describe('permissions', () => {
    it('l’admin de la plateforme approuve aussi', async () => {
      const body = await approved(await approve(REQ.yopougon, newKey(), admin));
      expect(body.request.decision?.decidedBy).toMatchObject({ id: STAFF.admin.id });
    });

    it('le support lit mais ne décide pas → 403, rien n’est créé', async () => {
      const before = await associationsCount();
      const res = await approve(REQ.yopougon, newKey(), support);
      expect(res.status).toBe(403);
      expect(await associationsCount()).toBe(before);
    });

    it('jeton gestionnaire → 404, rien n’est créé', async () => {
      const before = await associationsCount();
      const res = await approve(REQ.yopougon, newKey(), manager);
      expect(res.status).toBe(404);
      expect(await associationsCount()).toBe(before);
    });

    it('isolation : la nouvelle association, son abonnement et son owner sont invisibles depuis A', async () => {
      const body = await approved(await approve(REQ.yopougon, newKey()));
      const [user] = await rows<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [NEW_EMAIL]);
      const visible = async (tx: Tx) => [
        ...(await tx.select({ id: associations.id }).from(associations).where(eq(associations.id, body.associationId))),
        ...(await tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(eq(subscriptions.associationId, body.associationId))),
        ...(await tx
          .select({ id: memberships.id })
          .from(memberships)
          .where(eq(memberships.associationId, body.associationId))),
      ];
      expect(await h.as(asManagerOf(A), visible)).toEqual([]);
      // Témoin : son propre gestionnaire les voit (le test pourrait échouer).
      const own = { id: body.associationId, managerId: user?.id ?? '' };
      expect(await h.as(asManagerOf(own), visible)).toHaveLength(3);
    });

    it('sans jeton → 401', async () => {
      const res = await fetch(`${base}/platform/association-requests/${REQ.yopougon}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': newKey() },
        body: JSON.stringify(decision),
      });
      expect(res.status).toBe(401);
    });
  });

  describe('refus (pf.req.reject)', () => {
    it('demande refusée : motif, message, décideur, frise ; aucun espace ni compte créé', async () => {
      const before = await associationsCount();
      const res = await reject(REQ.yopougon, newKey());
      expect(res.status).toBe(200);
      const body = AssociationRequestDetail.parse(await res.json());
      expect(body).toMatchObject({
        id: REQ.yopougon,
        status: 'rejected',
        decision: {
          decidedBy: { id: STAFF.owner.id },
          rejectionReasonCode: 'incomplete',
          rejectionMessage: refusal.message,
          associationId: null,
        },
      });
      expect(body.history.map((e) => e.type)).toEqual(['received', 'rejected']);
      expect(await associationsCount()).toBe(before);
      expect(await count(`SELECT count(*) AS n FROM users WHERE email = $1`, [NEW_EMAIL])).toBe(0);
    });

    it('événement association.request_rejected et audit, dans la transaction', async () => {
      await reject(REQ.yopougon, newKey());
      expect(
        await rows(
          `SELECT association_id, payload FROM outbox_events
            WHERE event_type = 'association.request_rejected' AND aggregate_id = $1 ORDER BY id DESC LIMIT 1`,
          [REQ.yopougon],
        ),
      ).toEqual([{ association_id: null, payload: { requestId: REQ.yopougon, reasonCode: 'incomplete' } }]);
      const audit = await rows(
        `SELECT actor_user_id, association_id, after FROM audit_logs
          WHERE action = 'association_request.reject' AND entity_id = $1 ORDER BY id DESC LIMIT 1`,
        [REQ.yopougon],
      );
      expect(audit).toEqual([
        {
          actor_user_id: STAFF.owner.id,
          association_id: null,
          after: { status: 'rejected', rejectionReasonCode: 'incomplete' },
        },
      ]);
    });

    it('message facultatif', async () => {
      const res = await reject(REQ.yopougon, newKey(), owner, { reasonCode: 'out_of_scope' });
      expect(res.status).toBe(200);
      expect(AssociationRequestDetail.parse(await res.json()).decision).toMatchObject({
        rejectionReasonCode: 'out_of_scope',
        rejectionMessage: null,
      });
    });

    it('vérification : impossible de refuser une demande approuvée → 409, elle reste approuvée', async () => {
      const approval = await approved(await approve(REQ.yopougon, newKey()));
      const res = await reject(REQ.yopougon, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('request_already_handled');
      expect(
        await rows(`SELECT status, association_id FROM association_requests WHERE id = $1`, [REQ.yopougon]),
      ).toEqual([{ status: 'approved', association_id: approval.associationId }]);
    });

    it('refuser deux fois : même clé → même réponse ; autre clé → 409', async () => {
      const key = newKey();
      const first = await reject(REQ.yopougon, key);
      expect(first.status).toBe(200);
      const firstBody: unknown = await first.json();
      const again = await reject(REQ.yopougon, key);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await again.json()).toEqual(firstBody);
      const other = await reject(REQ.yopougon, newKey(), owner, { reasonCode: 'duplicate' });
      expect(other.status).toBe(409);
      expect(await codeOf(other)).toBe('request_already_handled');
    });

    it('l’admin refuse aussi ; la fiche du demandeur ne reste pas dans Redis', async () => {
      const key = newKey();
      const res = await reject(REQ.yopougon, key, admin);
      expect(res.status).toBe(200);
      const first: unknown = await res.json();
      const keys = await redis.keys(`cotiz:idem:*${key}`);
      expect(keys).toHaveLength(1);
      const stored = (await redis.get(keys[0] ?? '')) ?? '';
      expect(stored).not.toContain(NEW_EMAIL);
      expect(stored).not.toContain('+2250708091099');
      expect(stored).not.toContain(refusal.message);
      const again = await reject(REQ.yopougon, key, admin);
      expect(again.headers.get('idempotent-replayed')).toBe('true');
      expect(await again.json()).toEqual(first);
    });

    it('approuver une demande refusée → 409', async () => {
      await reject(REQ.yopougon, newKey());
      const res = await approve(REQ.yopougon, newKey());
      expect(res.status).toBe(409);
      expect(await codeOf(res)).toBe('request_already_handled');
    });

    it('demande inconnue → 404 ; motif vide → 422', async () => {
      expect((await reject(UNKNOWN, newKey())).status).toBe(404);
      const res = await reject(REQ.yopougon, newKey(), owner, { reasonCode: '' });
      expect(res.status).toBe(422);
    });

    it('le support ne refuse pas → 403 ; jeton gestionnaire → 404 ; la demande reste en attente', async () => {
      expect((await reject(REQ.yopougon, newKey(), support)).status).toBe(403);
      expect((await reject(REQ.yopougon, newKey(), manager)).status).toBe(404);
      expect(await rows(`SELECT status FROM association_requests WHERE id = $1`, [REQ.yopougon])).toEqual([
        { status: 'pending' },
      ]);
    });
  });
});
