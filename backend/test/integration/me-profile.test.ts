import type { INestApplication } from '@nestjs/common';
import { LoginResponse, Profile } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { A, type IsolationHarness, seedAssociations, startIsolationHarness } from '../isolation/harness.js';

/**
 * me.profile (lot 3.1, étape 2) : profil de la personne connectée (sa-profil, mg-profil, mb-profil) et changement de
 * mot de passe. Aucune route ne prend d'identifiant : la personne est toujours celle du jeton ; une autre personne n'est
 * jamais lue ni modifiée.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const NEW_PASSWORD = 'Fromager-Plateau-2027';
const STAFF = { id: '00000000-0000-7000-8000-0000000004a1', email: 'staff-profil@cotiz.test' };
const MANAGER = { id: '00000000-0000-7000-8000-0000000004a2', email: 'gestion-profil@cotiz.test' };
const SUB = { id: '00000000-0000-7000-8000-0000000004a3', phone: '+2250500000411' };

type Space = 'platform' | 'association' | 'subscriber';

describe('me.profile', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;

  const login = async (space: Space, identifier: string, password = PASSWORD) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space, identifier, password }),
    });
    if (res.status !== 200) return { status: res.status, token: '' };
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return { status: 200, token: body.accessToken };
  };
  const tokenOf = async (space: Space, identifier: string) => (await login(space, identifier)).token;

  const call = (method: string, path: string, token: string, body?: unknown) =>
    fetch(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? null : JSON.stringify(body),
    });
  const problemOf = async (res: Response) => (await res.json()) as { code: string; fields?: Record<string, string> };

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO users (id, email, phone_e164, first_name, last_name, status, locale) VALUES
         ($1, $2, NULL, 'Richy', 'Nda', 'active', 'fr-CI'),
         ($3, $4, NULL, 'Awa', 'Koné', 'active', 'fr-CI'),
         ($5, NULL, $6, 'Moussa', 'Diarra', 'active', 'fr-CI')`,
      [STAFF.id, STAFF.email, MANAGER.id, MANAGER.email, SUB.id, SUB.phone],
    );
    const hash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(
      `INSERT INTO credentials (user_id, password_hash, password_changed_at)
       VALUES ($1, $4, '2026-10-01T08:00:00Z'), ($2, $4, NULL), ($3, $4, NULL)`,
      [STAFF.id, MANAGER.id, SUB.id, hash],
    );
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner')`, [STAFF.id]);
    await h.superuser(
      `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at) VALUES
         (gen_random_uuid(), $1, $2, 'owner', 'active', now()),
         (gen_random_uuid(), $1, $3, 'subscriber', 'active', now())`,
      [A.id, MANAGER.id, SUB.id],
    );
    await h.superuser(`INSERT INTO subscriber_profiles (user_id, address, city) VALUES ($1, 'Rue 12', 'Yopougon')`, [
      SUB.id,
    ]);
    app = await createApp(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: h.db.urlFor('cotiz_app'),
        REDIS_URL: redis.getConnectionUrl(),
        S3_ENDPOINT: 'http://127.0.0.1:1',
        RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      }),
      { logger: false },
    );
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  describe('GET /me/profile', () => {
    it('personnel plateforme : identité, date du dernier changement de mot de passe, sans adresse', async () => {
      const res = await call('GET', '/me/profile', await tokenOf('platform', STAFF.email));
      expect(res.status).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-store');
      expect(Profile.parse(await res.json())).toEqual({
        id: STAFF.id,
        firstName: 'Richy',
        lastName: 'Nda',
        email: STAFF.email,
        phone: null,
        address: null,
        city: null,
        locale: 'fr-CI',
        passwordChangedAt: '2026-10-01T08:00:00.000Z',
        mfaEnabled: false,
        version: 1,
      });
    });

    it('souscripteur : téléphone, adresse et ville de son profil de souscripteur', async () => {
      const res = await call('GET', '/me/profile', await tokenOf('subscriber', SUB.phone));
      expect(res.status).toBe(200);
      expect(Profile.parse(await res.json())).toMatchObject({
        id: SUB.id,
        phone: SUB.phone,
        email: null,
        address: 'Rue 12',
        city: 'Yopougon',
        passwordChangedAt: null,
      });
    });

    it('sans jeton : 401', async () => {
      expect((await fetch(`${base}/me/profile`)).status).toBe(401);
    });
  });

  describe('PATCH /me/profile', () => {
    it('modifie seulement la personne du jeton (version incrémentée, audité) ; les autres comptes ne bougent pas', async () => {
      const token = await tokenOf('association', MANAGER.email);
      const res = await call('PATCH', '/me/profile', token, { firstName: 'Awa Marie', locale: 'fr-FR' });
      expect(res.status).toBe(200);
      expect(Profile.parse(await res.json())).toMatchObject({
        id: MANAGER.id,
        firstName: 'Awa Marie',
        lastName: 'Koné',
        locale: 'fr-FR',
        version: 2,
      });
      const { rows } = await h.superuser(`SELECT id, first_name FROM users WHERE id = ANY($1) ORDER BY id`, [
        [STAFF.id, MANAGER.id, SUB.id],
      ]);
      expect(rows).toEqual([
        { id: STAFF.id, first_name: 'Richy' },
        { id: MANAGER.id, first_name: 'Awa Marie' },
        { id: SUB.id, first_name: 'Moussa' },
      ]);
      const audit = await h.superuser(
        `SELECT actor_user_id, entity_id, association_id FROM audit_logs WHERE action = 'user.update_profile'`,
      );
      // Profil d'une personne : aucune association, même en session de l'espace association (route /me sans {aid}).
      expect(audit.rows).toEqual([{ actor_user_id: MANAGER.id, entity_id: MANAGER.id, association_id: null }]);
    });

    it('souscripteur : email ajouté, adresse et ville de son profil de souscripteur', async () => {
      const token = await tokenOf('subscriber', SUB.phone);
      const res = await call('PATCH', '/me/profile', token, {
        email: 'moussa@exemple.ci',
        address: 'Rue 14',
        city: null,
      });
      expect(res.status).toBe(200);
      expect(Profile.parse(await res.json())).toMatchObject({
        email: 'moussa@exemple.ci',
        address: 'Rue 14',
        city: null,
      });
      const { rows } = await h.superuser(`SELECT address, city FROM subscriber_profiles WHERE user_id = $1`, [SUB.id]);
      expect(rows).toEqual([{ address: 'Rue 14', city: null }]);
    });

    it('email d’un autre compte : 422 validation_failed (email pris), rien n’est écrit', async () => {
      const token = await tokenOf('platform', STAFF.email);
      const res = await call('PATCH', '/me/profile', token, { email: MANAGER.email.toUpperCase(), lastName: 'X' });
      expect(res.status).toBe(422);
      expect(await problemOf(res)).toMatchObject({ code: 'validation_failed', fields: { email: 'taken' } });
      const { rows } = await h.superuser(`SELECT last_name FROM users WHERE id = $1`, [STAFF.id]);
      expect(rows).toEqual([{ last_name: 'Nda' }]);
    });

    it('gestionnaire ou personnel plateforme : l’email (identifiant de connexion) ne peut pas être retiré', async () => {
      for (const [space, email] of [
        ['platform', STAFF.email],
        ['association', MANAGER.email],
      ] as const) {
        const res = await call('PATCH', '/me/profile', await tokenOf(space, email), { email: null });
        expect(res.status).toBe(422);
        expect(await problemOf(res)).toMatchObject({ code: 'validation_failed', fields: { email: 'required' } });
      }
    });

    it('sans profil de souscripteur : adresse et ville refusées (422)', async () => {
      const res = await call('PATCH', '/me/profile', await tokenOf('platform', STAFF.email), { city: 'Abidjan' });
      expect(res.status).toBe(422);
      expect(await problemOf(res)).toMatchObject({ code: 'validation_failed', fields: { city: 'not_applicable' } });
    });

    it('téléphone (identifiant du souscripteur, hors du corps du contrat) : ignoré, jamais modifié', async () => {
      const res = await call('PATCH', '/me/profile', await tokenOf('subscriber', SUB.phone), {
        phone: '+2250500000999',
      });
      expect(res.status).toBe(200);
      expect(Profile.parse(await res.json()).phone).toBe(SUB.phone);
    });
  });

  describe('PUT /me/password', () => {
    it('mot de passe actuel faux : 401 invalid_credentials ; mot de passe trop faible : 422 weak_password', async () => {
      const token = await tokenOf('platform', STAFF.email);
      const wrong = await call('PUT', '/me/password', token, { currentPassword: 'faux', newPassword: NEW_PASSWORD });
      expect(wrong.status).toBe(401);
      expect((await problemOf(wrong)).code).toBe('invalid_credentials');
      const weak = await call('PUT', '/me/password', token, { currentPassword: PASSWORD, newPassword: 'Password123' });
      expect(weak.status).toBe(422);
      expect((await problemOf(weak)).code).toBe('weak_password');
    });

    it('gestionnaire (session de l’espace association) : changé, audité sans association', async () => {
      const token = await tokenOf('association', MANAGER.email);
      const res = await call('PUT', '/me/password', token, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(204);
      expect((await login('association', MANAGER.email, NEW_PASSWORD)).status).toBe(200);
      const audit = await h.superuser(
        `SELECT entity_id, association_id FROM audit_logs WHERE action = 'user.change_password' AND entity_id = $1`,
        [MANAGER.id],
      );
      expect(audit.rows).toEqual([{ entity_id: MANAGER.id, association_id: null }]);
    });

    it('change le mot de passe, garde la session en cours et révoque les autres', async () => {
      const current = await tokenOf('subscriber', SUB.phone);
      const other = await tokenOf('subscriber', SUB.phone);
      const res = await call('PUT', '/me/password', current, { currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      expect(res.status).toBe(204);

      expect((await call('GET', '/me/profile', current)).status).toBe(200);
      const revoked = await call('GET', '/me/profile', other);
      expect(revoked.status).toBe(401);
      expect((await problemOf(revoked)).code).toBe('session_revoked');

      expect((await login('subscriber', SUB.phone)).status).toBe(401);
      expect((await login('subscriber', SUB.phone, NEW_PASSWORD)).status).toBe(200);

      const profile = Profile.parse(await (await call('GET', '/me/profile', current)).json());
      expect(profile.passwordChangedAt).not.toBeNull();
      const events = await h.superuser(
        `SELECT payload FROM outbox_events WHERE event_type = 'user.password_changed' AND payload->>'userId' = $1`,
        [SUB.id],
      );
      expect(events.rows).toEqual([{ payload: { userId: SUB.id } }]);
      const audit = await h.superuser(
        `SELECT entity_id, after FROM audit_logs WHERE action = 'user.change_password' AND entity_id = $1`,
        [SUB.id],
      );
      const rows = audit.rows as { entity_id: string; after: unknown }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]?.entity_id).toBe(SUB.id);
      expect(JSON.stringify(rows[0]?.after)).not.toContain(NEW_PASSWORD);
    });
  });
});
