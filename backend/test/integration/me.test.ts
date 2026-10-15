import type { INestApplication } from '@nestjs/common';
import { LoginResponse, Me } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { AccessTokenSigner } from '../../src/modules/identity/infra/access-token-signer.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { DELIVERED_FEATURES } from '../../src/shared/features/index.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/** GET /me (lot 1.1, étape 5) : identité, espace, rôles, permissions et fonctionnalités de la personne connectée. */

const PASSWORD = 'Baobab-Lagune-2026';
const OWNER = { id: '00000000-0000-7000-8000-0000000003a1', email: 'owner-me@cotiz.test' };
const SUPPORT = { id: '00000000-0000-7000-8000-0000000003a2', email: 'support-me@cotiz.test' };

describe('GET /me', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;

  const tokenOf = async (email: string) => {
    const res = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space: 'platform', identifier: email, password: PASSWORD }),
    });
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return body.accessToken;
  };

  const me = (token?: string) => fetch(`${base}/me`, { headers: token ? { authorization: `Bearer ${token}` } : {} });

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await h.superuser(
      `INSERT INTO users (id, email, phone_e164, first_name, last_name, status, locale) VALUES
         ($1, $2, '+2250700000003', 'Richy', 'Nda', 'active', 'fr-CI'),
         ($3, $4, NULL, 'Sali', 'Bamba', 'active', 'fr-FR')`,
      [OWNER.id, OWNER.email, SUPPORT.id, SUPPORT.email],
    );
    const hash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $3), ($2, $3)`, [
      OWNER.id,
      SUPPORT.id,
      hash,
    ]);
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner'), ($2, 'support')`, [
      OWNER.id,
      SUPPORT.id,
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

  it('owner plateforme : identité, espace, rôle, permissions et fonctionnalités, conformes au contrat', async () => {
    const res = await me(await tokenOf(OWNER.email));
    expect(res.status).toBe(200);
    const body = Me.parse(await res.json());
    expect(body).toMatchObject({
      user: {
        id: OWNER.id,
        firstName: 'Richy',
        lastName: 'Nda',
        email: OWNER.email,
        phone: '+2250700000003',
        locale: 'fr-CI',
      },
      space: 'platform',
      currentAssociationId: null,
      memberships: [],
      platformRole: 'owner',
      features: [...DELIVERED_FEATURES],
    });
    expect(body.permissions).toContain('platform.staff.manage');
    expect(body.permissions).toContain('platform.associations.manage');
    expect(body.permissions).not.toContain('association.read');
    expect(body.permissions).not.toContain('subscriber.self');
  });

  it('support plateforme : ses seules permissions (lecture)', async () => {
    const body = Me.parse(await (await me(await tokenOf(SUPPORT.email))).json());
    expect(body.platformRole).toBe('support');
    expect(body.permissions).toContain('platform.associations.read');
    expect(body.permissions).not.toContain('platform.associations.manage');
    expect(body.permissions).not.toContain('platform.staff.manage');
  });

  it('chacun ne voit que sa propre identité (jamais celle d’un autre)', async () => {
    const [owner, support] = await Promise.all([tokenOf(OWNER.email), tokenOf(SUPPORT.email)]);
    expect(Me.parse(await (await me(owner)).json()).user.id).toBe(OWNER.id);
    expect(Me.parse(await (await me(support)).json()).user.id).toBe(SUPPORT.id);
  });

  it('personnel retiré depuis la connexion : plus de rôle ni de permission plateforme', async () => {
    const token = await tokenOf(SUPPORT.email);
    await h.superuser('DELETE FROM platform_staff WHERE user_id = $1', [SUPPORT.id]);
    try {
      const body = Me.parse(await (await me(token)).json());
      expect(body.platformRole).toBeNull();
      expect(body.permissions).toEqual(['public', 'authenticated']);
    } finally {
      await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'support')`, [SUPPORT.id]);
    }
  });

  it('jamais mis en cache', async () => {
    const res = await me(await tokenOf(OWNER.email));
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('souscripteur : espace subscriber, subscriber.self, aucun rôle plateforme même s’il en a un', async () => {
    // Connexion souscripteur : lot 1.2 (appartenances) ; jeton signé par l'api pour éprouver /me dès maintenant.
    const { token } = await app
      .get(AccessTokenSigner)
      .sign({ sub: OWNER.id, space: 'subscriber', sid: '00000000-0000-7000-8000-00000000d001' });
    const body = Me.parse(await (await me(token)).json());
    expect(body.space).toBe('subscriber');
    expect(body.platformRole).toBeNull();
    expect(body.permissions).toContain('subscriber.self');
    expect(body.permissions.filter((p) => p.startsWith('platform.'))).toEqual([]);
  });

  it('jeton valide d’une personne inconnue : 401 session_expired', async () => {
    const { token } = await app.get(AccessTokenSigner).sign({
      sub: '00000000-0000-7000-8000-0000000003ff',
      space: 'platform',
      sid: '00000000-0000-7000-8000-00000000d002',
    });
    const res = await me(token);
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('session_expired');
  });

  it('sans jeton : 401 session_expired', async () => {
    const res = await me();
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('session_expired');
  });
});
