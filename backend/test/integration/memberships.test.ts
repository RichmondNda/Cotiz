import { Controller, Get, HttpCode, type INestApplication, Module, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoginResponse, Me } from '@cotiz/contracts';
import { sql } from 'drizzle-orm';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { type Config, loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { Can, Endpoint, requireActor } from '../../src/shared/http/index.js';
import { currentContext, currentTx } from '../../src/shared/tenant-context/index.js';
import { A, B, type IsolationHarness, seedAssociations, startIsolationHarness, USERS } from '../isolation/harness.js';

/**
 * Lot 1.2 · étape 3 : appartenances et connexion, à travers les vraies gardes et un vrai PostgreSQL.
 * - auth.login (et refresh, forgot) : espace association = appartenance active owner/manager/viewer ; espace
 *   subscriber = appartenance souscripteur active ; invitée ou retirée → wrong_space.
 * - MembershipGuard : le `{aid}` de l'URL contre une appartenance active ; le jeton ne porte aucune association.
 *   Non-membre, souscripteur, invité, retiré, aid invalide : 404 (rien n'est révélé).
 * - PermissionGuard : rôle d'association (association:owner…) et rôle plateforme lus en base à chaque requête.
 * - GET /me : appartenances, association courante (première gérée), permissions du rôle.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const STAFF = { id: '00000000-0000-7000-8000-0000000007a1', email: 'staff-memberships@cotiz.test' };
const email = (key: keyof typeof USERS) => `${key}@test.cotiz.app`;

/**
 * Awa : owner active de A, souscriptrice active de B. Koffi : manager invité de A. Moussa : souscripteur actif de A.
 * Fatou : lectrice (viewer) active de B, souscriptrice retirée de B. Aminata : manager retirée de A.
 */
const MEMBERSHIPS: [string, string, string, string, string | null][] = [
  [A.id, USERS.awa, 'owner', 'active', 'Présidente'],
  [B.id, USERS.awa, 'subscriber', 'active', null],
  [A.id, USERS.koffi, 'manager', 'invited', null],
  [A.id, USERS.moussa, 'subscriber', 'active', null],
  [B.id, USERS.fatou, 'viewer', 'active', 'Trésorière'],
  [B.id, USERS.fatou, 'subscriber', 'removed', null],
  [A.id, USERS.aminata, 'manager', 'removed', null],
];

/** Routes de test rattachées à des endpoints d'association du contrat (lecture ; gestion des projets). */
@Controller('associations-probe/:aid')
class AssociationProbe {
  @Get()
  @Endpoint('as.get', 'get')
  @Can('association.read')
  async read() {
    const actor = requireActor();
    const { rows } = await currentTx().execute<{ id: string }>(sql`SELECT id FROM associations ORDER BY id`);
    return { context: currentContext(), actor, associations: rows.map((r) => r.id) };
  }

  @Post('manage')
  @HttpCode(200)
  @Endpoint('pr.preview', 'preview')
  @Can('projects.manage')
  manage() {
    return { ok: true };
  }
}

/** Route de test de l'espace plateforme, rattachée à un endpoint du contrat dont la permission exige un rôle. */
@Controller('platform-probe')
class PlatformProbe {
  @Get()
  @Endpoint('pf.req.list', 'list')
  @Can('platform.associations.read')
  read() {
    return { ok: true };
  }
}

@Module({ controllers: [AssociationProbe, PlatformProbe] })
class ProbeModule {}

describe('appartenances et connexion (association, souscripteur, plateforme)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  const login = (space: string, identifier: string) => post('/auth/login', { space, identifier, password: PASSWORD });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

  /** Connexion réussie : jeton d'accès et cookie de renouvellement. */
  const session = async (space: string, identifier: string) => {
    const res = await login(space, identifier);
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('cotiz_refresh=')) ?? '';
    return { token: body.accessToken, refresh: /^cotiz_refresh=([^;]*)/.exec(cookie)?.[1] ?? '' };
  };
  const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
  const probe = (token: string, aid: string) => fetch(`${base}/associations-probe/${aid}`, { headers: bearer(token) });
  const manage = (token: string, aid: string) => post(`/associations-probe/${aid}/manage`, {}, bearer(token));
  const me = async (token: string) => Me.parse(await (await fetch(`${base}/me`, { headers: bearer(token) })).json());

  const setStatus = (association: string, user: string, role: string, status: string) =>
    h.superuser(`UPDATE memberships SET status = $4 WHERE association_id = $1 AND user_id = $2 AND role = $3`, [
      association,
      user,
      role,
      status,
    ]);

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await seedAssociations(h);
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Richy', 'Nda', 'active')`,
      [STAFF.id, STAFF.email],
    );
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'support')`, [STAFF.id]);
    const hash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) SELECT id, $1 FROM users`, [hash]);
    for (const [association, user, role, status, title] of MEMBERSHIPS) {
      await h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, title, joined_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4::memberships_status, $5, CASE WHEN $4::text = 'active' THEN now() END)`,
        [association, user, role, status, title],
      );
    }
    const config: Config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
    });
    @Module({ imports: [AppModule.register(config), ProbeModule] })
    class TestRoot {}
    app = await NestFactory.create(TestRoot, { logger: false });
    configureApp(app, config);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await redis.exec(['redis-cli', 'FLUSHALL']);
  });

  describe('auth.login : un espace = une appartenance active', () => {
    it.each([
      ['association', 'awa', 'owner active de A'],
      ['association', 'fatou', 'lectrice active de B'],
      ['subscriber', 'awa', 'souscriptrice active de B'],
      ['subscriber', 'moussa', 'souscripteur actif de A'],
    ] as const)('espace %s : %s (%s) se connecte ; le jeton ne porte aucune association', async (space, key, _why) => {
      const { token } = await session(space, email(key));
      const claims = decodeJwt(token);
      expect(claims).toMatchObject({ sub: USERS[key], space });
      expect(claims.aid).toBeUndefined();
    });

    it.each([
      ['association', 'moussa', 'souscripteur seulement'],
      ['association', 'koffi', 'manager seulement invité'],
      ['association', 'aminata', 'manager retirée'],
      ['subscriber', 'koffi', 'aucune appartenance souscripteur'],
      ['subscriber', 'fatou', 'souscriptrice retirée'],
      ['platform', 'awa', 'pas du personnel'],
    ] as const)('espace %s : %s (%s) → wrong_space, aucune session', async (space, key, _why) => {
      const res = await login(space, email(key));
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('wrong_space');
      const { rows } = await h.superuser('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND space = $2', [
        USERS[key],
        space,
      ]);
      expect(rows[0]).toEqual({ n: 0 });
    });

    it('le personnel plateforme se connecte toujours à son espace, et à aucun autre', async () => {
      expect(decodeJwt((await session('platform', STAFF.email)).token)).toMatchObject({ space: 'platform' });
      expect(await codeOf(await login('association', STAFF.email))).toBe('wrong_space');
      expect(await codeOf(await login('subscriber', STAFF.email))).toBe('wrong_space');
    });
  });

  describe('auth.refresh : l’appartenance est revérifiée', () => {
    it('appartenance retirée après la connexion : session_revoked, la connexion entière est fermée', async () => {
      const { refresh } = await session('subscriber', email('moussa'));
      await setStatus(A.id, USERS.moussa, 'subscriber', 'removed');
      try {
        const res = await post('/auth/refresh', {}, { cookie: `cotiz_refresh=${refresh}` });
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('session_revoked');
      } finally {
        await setStatus(A.id, USERS.moussa, 'subscriber', 'active');
      }
    });

    it('appartenance toujours active : renouvelée', async () => {
      const { refresh } = await session('association', email('awa'));
      const res = await post('/auth/refresh', {}, { cookie: `cotiz_refresh=${refresh}` });
      expect(res.status).toBe(200);
    });
  });

  describe('MembershipGuard : {aid} de l’URL contre une appartenance active', () => {
    it('owner de A sur A : contexte association de A, rôle owner, seule A visible', async () => {
      const { token } = await session('association', email('awa'));
      const res = await probe(token, A.id);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        context: { space: 'association', associationId: A.id, userId: USERS.awa },
        actor: { space: 'association', associationId: A.id, userId: USERS.awa },
        associations: [A.id],
      });
    });

    it('owner de A sur B (où elle n’est que souscriptrice) : 404, comme une association inconnue', async () => {
      const { token } = await session('association', email('awa'));
      const res = await probe(token, B.id);
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe('not_found');
      expect((await probe(token, '00000000-0000-7000-8000-00000000a999')).status).toBe(404);
      expect((await probe(token, 'pas-un-uuid')).status).toBe(404);
    });

    it('appartenance retirée ou rétrogradée en invitée après la connexion : 404 dès la requête suivante', async () => {
      const { token } = await session('association', email('awa'));
      for (const status of ['removed', 'invited']) {
        await setStatus(A.id, USERS.awa, 'owner', status);
        try {
          expect({ status, http: (await probe(token, A.id)).status }).toEqual({ status, http: 404 });
        } finally {
          await setStatus(A.id, USERS.awa, 'owner', 'active');
        }
      }
      expect((await probe(token, A.id)).status).toBe(200);
    });

    it('aid en majuscules : même association, contexte sous forme canonique (minuscules)', async () => {
      const { token } = await session('association', email('awa'));
      const res = await probe(token, A.id.toUpperCase());
      expect(res.status).toBe(200);
      expect(((await res.json()) as { context: { associationId: string } }).context.associationId).toBe(A.id);
    });

    it('lectrice de A et owner de B, sur A : le rôle de A (lecture), jamais celui de B', async () => {
      await h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'viewer', 'active', now())`,
        [A.id, USERS.fatou],
      );
      await setStatus(B.id, USERS.fatou, 'viewer', 'removed');
      await h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'owner', 'active', now())`,
        [B.id, USERS.fatou],
      );
      try {
        const { token } = await session('association', email('fatou'));
        expect((await probe(token, A.id)).status).toBe(200);
        expect((await manage(token, A.id)).status).toBe(403);
        expect((await manage(token, B.id)).status).toBe(200);
      } finally {
        await h.superuser(
          `DELETE FROM memberships WHERE user_id = $1 AND ((association_id = $2 AND role = 'viewer') OR role = 'owner')`,
          [USERS.fatou, A.id],
        );
        await setStatus(B.id, USERS.fatou, 'viewer', 'active');
      }
    });

    it('jeton souscripteur ou plateforme sur une route d’association : 404', async () => {
      expect((await probe((await session('subscriber', email('moussa'))).token, A.id)).status).toBe(404);
      expect((await probe((await session('platform', STAFF.email)).token, A.id)).status).toBe(404);
    });

    it('permission du rôle : la lectrice lit mais ne gère pas (403), l’owner gère', async () => {
      const viewer = (await session('association', email('fatou'))).token;
      expect((await probe(viewer, B.id)).status).toBe(200);
      const refused = await manage(viewer, B.id);
      expect(refused.status).toBe(403);
      expect(await codeOf(refused)).toBe('forbidden');
      const owner = (await session('association', email('awa'))).token;
      expect((await manage(owner, A.id)).status).toBe(200);
    });
  });

  describe('PermissionGuard : rôle plateforme lu en base', () => {
    it('le jeton plateforme d’un membre retiré du personnel perd aussitôt l’accès aux routes de son rôle (403)', async () => {
      const { token } = await session('platform', STAFF.email);
      const read = () => fetch(`${base}/platform-probe`, { headers: bearer(token) });
      expect((await read()).status).toBe(200);
      await h.superuser('DELETE FROM platform_staff WHERE user_id = $1', [STAFF.id]);
      try {
        const refused = await read();
        expect(refused.status).toBe(403);
        expect(await codeOf(refused)).toBe('forbidden');
        expect((await me(token)).permissions).not.toContain('platform.associations.read');
      } finally {
        await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'support')`, [STAFF.id]);
      }
      expect((await read()).status).toBe(200);
    });
  });

  describe('fl.upload avec un jeton association (aucune association dans le jeton)', () => {
    it('logo : refus explicite 403, aucun fichier enregistré (pas d’erreur SQL)', async () => {
      const { token } = await session('association', email('awa'));
      const res = await post(
        '/uploads',
        { purpose: 'logo', fileName: 'logo.png', mimeType: 'image/png', sizeBytes: 1000 },
        bearer(token),
      );
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
      const { rows } = await h.superuser('SELECT count(*)::int AS n FROM files WHERE owner_user_id = $1', [USERS.awa]);
      expect(rows[0]).toEqual({ n: 0 });
    });
  });

  describe('GET /me', () => {
    it('gestionnaire : ses appartenances actives, association courante (première gérée), permissions de son rôle', async () => {
      const body = await me((await session('association', email('awa'))).token);
      expect(body.space).toBe('association');
      expect(body.currentAssociationId).toBe(A.id);
      expect(body.memberships).toEqual([
        {
          association: {
            id: A.id,
            name: 'Entraide Yopougon',
            logoFileId: null,
            slug: 'entraide-yopougon',
            status: 'active',
          },
          role: 'owner',
          title: 'Présidente',
        },
        {
          association: {
            id: B.id,
            name: 'Ressortissants de Man',
            logoFileId: null,
            slug: 'ressortissants-man',
            status: 'active',
          },
          role: 'subscriber',
          title: null,
        },
      ]);
      expect(body.permissions).toContain('projects.manage');
      expect(body.permissions).toContain('association.team.manage');
      expect(body.permissions).not.toContain('subscriber.self');
      expect(body.platformRole).toBeNull();
    });

    it('lectrice : permissions de lecture seulement ; ni invitations ni appartenances retirées', async () => {
      const body = await me((await session('association', email('fatou'))).token);
      expect(body.currentAssociationId).toBe(B.id);
      expect(body.memberships.map((m) => [m.association.id, m.role])).toEqual([[B.id, 'viewer']]);
      expect(body.permissions).toContain('association.read');
      expect(body.permissions).not.toContain('projects.manage');
    });

    it('souscripteur : ses appartenances, aucune association courante, subscriber.self', async () => {
      const body = await me((await session('subscriber', email('moussa'))).token);
      expect(body.space).toBe('subscriber');
      expect(body.currentAssociationId).toBeNull();
      expect(body.memberships.map((m) => [m.association.id, m.role])).toEqual([[A.id, 'subscriber']]);
      expect(body.permissions).toContain('subscriber.self');
    });

    it('gestionnaire dont toutes les appartenances de gestion ont été retirées : plus d’association courante', async () => {
      const { token } = await session('association', email('fatou'));
      await setStatus(B.id, USERS.fatou, 'viewer', 'removed');
      try {
        const body = await me(token);
        expect(body.currentAssociationId).toBeNull();
        expect(body.permissions).not.toContain('association.read');
      } finally {
        await setStatus(B.id, USERS.fatou, 'viewer', 'active');
      }
    });
  });

  describe('auth.forgot : demandes rattachées', () => {
    const requests = async (userId: string) =>
      (
        await h.superuser(
          `SELECT association_id, space FROM password_reset_requests WHERE user_id = $1 ORDER BY association_id`,
          [userId],
        )
      ).rows as { association_id: string | null; space: string }[];

    it('souscriptrice de B : une demande traitée par B (association_id), un événement par association', async () => {
      await h.superuser('DELETE FROM password_reset_requests');
      expect((await post('/auth/password/forgot', { space: 'subscriber', identifier: email('awa') })).status).toBe(202);
      expect(await requests(USERS.awa)).toEqual([{ association_id: B.id, space: 'subscriber' }]);
      const { rows } = await h.superuser(
        `SELECT association_id, payload->'associationIds' AS ids FROM outbox_events
          WHERE event_type = 'password_reset.requested' AND payload->>'userId' = $1`,
        [USERS.awa],
      );
      expect(rows).toEqual([{ association_id: B.id, ids: [B.id] }]);
    });

    it('gestionnaire : demande traitée par la plateforme (association_id NULL)', async () => {
      await h.superuser('DELETE FROM password_reset_requests');
      expect((await post('/auth/password/forgot', { space: 'association', identifier: email('awa') })).status).toBe(
        202,
      );
      expect(await requests(USERS.awa)).toEqual([{ association_id: null, space: 'association' }]);
    });

    it('souscripteur de deux associations : 3 demandes par 24 h (une ligne par association), la 4e ne crée rien', async () => {
      await h.superuser('DELETE FROM password_reset_requests');
      await h.superuser(
        `INSERT INTO memberships (id, association_id, user_id, role, status, joined_at)
         VALUES (gen_random_uuid(), $1, $2, 'subscriber', 'active', now())`,
        [B.id, USERS.moussa],
      );
      try {
        for (let i = 0; i < 4; i += 1) {
          const res = await post('/auth/password/forgot', { space: 'subscriber', identifier: email('moussa') });
          expect(res.status).toBe(202);
        }
        const rows = await requests(USERS.moussa);
        expect(rows.filter((r) => r.association_id === A.id)).toHaveLength(3);
        expect(rows.filter((r) => r.association_id === B.id)).toHaveLength(3);
      } finally {
        await h.superuser(`DELETE FROM memberships WHERE association_id = $1 AND user_id = $2`, [B.id, USERS.moussa]);
      }
    });

    it('appartenance retirée : aucune demande (même réponse 202)', async () => {
      await h.superuser('DELETE FROM password_reset_requests');
      expect((await post('/auth/password/forgot', { space: 'subscriber', identifier: email('fatou') })).status).toBe(
        202,
      );
      expect(await requests(USERS.fatou)).toEqual([]);
    });
  });
});
