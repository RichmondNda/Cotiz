import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { AccessToken, LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { AccessTokenSigner } from '../../src/modules/identity/infra/access-token-signer.js';
import { RevokedSessions } from '../../src/modules/identity/infra/revoked-sessions.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * auth.refresh et auth.logout (lot 1.1, étape 3) : rotation du jeton de renouvellement, réutilisation d'un jeton
 * révoqué → toute la famille révoquée, déconnexion avec liste noire Redis du `sid`.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const OWNER = { id: '00000000-0000-7000-8000-0000000002a1', email: 'owner-session@cotiz.test' };

interface Opened {
  accessToken: string;
  refresh: string;
  cookie: string;
}

const refreshOf = (res: Response) => {
  const cookie = res.headers.getSetCookie().find((c) => c.startsWith('cotiz_refresh=')) ?? '';
  return { cookie, refresh: /^cotiz_refresh=([^;]*)/.exec(cookie)?.[1] ?? '' };
};
const sha256 = (token: string) => createHash('sha256').update(token).digest('hex');

describe('auth.refresh et auth.logout', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;
  let env: Record<string, string>;

  const post = (path: string, headers: Record<string, string> = {}, body?: unknown) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { ...headers, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

  const login = async (rememberMe = false): Promise<Opened> => {
    const res = await post(
      '/auth/login',
      {},
      { space: 'platform', identifier: OWNER.email, password: PASSWORD, rememberMe },
    );
    expect(res.status).toBe(200);
    const body = LoginResponse.parse(await res.json());
    if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
    return { accessToken: body.accessToken, ...refreshOf(res) };
  };

  const refresh = (token: string) => post('/auth/refresh', { cookie: `cotiz_refresh=${token}` });

  /** Renouvellement réussi : nouveau jeton d'accès et nouveau cookie. */
  const rotate = async (token: string): Promise<Opened> => {
    const res = await refresh(token);
    expect(res.status).toBe(200);
    const body = AccessToken.parse(await res.json());
    return { accessToken: body.accessToken, ...refreshOf(res) };
  };

  const logout = (accessToken: string) => post('/auth/logout', { authorization: `Bearer ${accessToken}` });

  const sessionOf = async (token: string) =>
    (await h.superuser('SELECT * FROM sessions WHERE refresh_token_hash = $1', [sha256(token)])).rows[0] as
      { id: string; family_id: string; revoked_at: Date | null; remember_me: boolean; expires_at: Date } | undefined;

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Richy', 'Nda', 'active')`,
      [OWNER.id, OWNER.email],
    );
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)`, [
      OWNER.id,
      await new SecretHasher().hash(PASSWORD),
    ]);
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner')`, [OWNER.id]);
    env = {
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
      // Une erreur 500 intermittente du login a été vue deux fois sans être reproduite : sa trace doit rester visible.
      LOG_LEVEL: 'error',
    };
    const config = loadConfig(env);
    app = await createApp(config, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await h.superuser(`UPDATE users SET status = 'active' WHERE id = $1`, [OWNER.id]);
  });

  describe('auth.refresh', () => {
    it('rotation : nouveau jeton d’accès et nouveau cookie, ancienne session révoquée, même famille', async () => {
      const opened = await login();
      const before = await sessionOf(opened.refresh);
      const renewed = await rotate(opened.refresh);

      expect(renewed.refresh).not.toBe(opened.refresh);
      expect(renewed.cookie).toMatch(/; HttpOnly/);
      expect(renewed.cookie).toMatch(/; Secure/);
      expect(renewed.cookie).toMatch(/; SameSite=Lax/);
      expect(renewed.cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);

      const old = await sessionOf(opened.refresh);
      const current = await sessionOf(renewed.refresh);
      expect(old?.revoked_at).not.toBeNull();
      expect(current).toMatchObject({ family_id: before?.family_id, revoked_at: null });
      expect(current?.id).not.toBe(before?.id);

      const claims = decodeJwt(renewed.accessToken);
      expect(claims).toMatchObject({ sub: OWNER.id, space: 'platform', sid: current?.id });
    });

    it('« rester connecté » recopié à chaque rotation : cookie persistant, ou de session', async () => {
      const persistent = await login(true);
      expect((await sessionOf(persistent.refresh))?.remember_me).toBe(true);
      const renewedPersistent = await rotate(persistent.refresh);
      // Durée restante de la connexion (quelques secondes de moins que 30 jours).
      const maxAge = Number(/; Max-Age=(\d+)/.exec(renewedPersistent.cookie)?.[1]);
      expect(maxAge).toBeGreaterThan(2_592_000 - 60);
      expect(maxAge).toBeLessThanOrEqual(2_592_000);
      expect((await sessionOf(renewedPersistent.refresh))?.remember_me).toBe(true);

      const ephemeral = await login(false);
      const renewedEphemeral = await rotate(ephemeral.refresh);
      expect(renewedEphemeral.cookie).not.toMatch(/Max-Age|Expires/i);
      expect((await sessionOf(renewedEphemeral.refresh))?.remember_me).toBe(false);
    });

    it('30 jours au plus après la connexion : la rotation ne prolonge jamais l’échéance', async () => {
      const opened = await login(true);
      await h.superuser(`UPDATE sessions SET expires_at = now() + interval '1 hour' WHERE refresh_token_hash = $1`, [
        sha256(opened.refresh),
      ]);
      const deadline = (await sessionOf(opened.refresh))?.expires_at.getTime();
      const renewed = await rotate(opened.refresh);
      const again = await rotate(renewed.refresh);
      expect((await sessionOf(renewed.refresh))?.expires_at.getTime()).toBe(deadline);
      expect((await sessionOf(again.refresh))?.expires_at.getTime()).toBe(deadline);
      // Cookie persistant : jusqu'à l'échéance de la connexion, pas 30 jours de plus.
      const maxAge = Number(/; Max-Age=(\d+)/.exec(again.cookie)?.[1]);
      expect(maxAge).toBeGreaterThan(3600 - 60);
      expect(maxAge).toBeLessThanOrEqual(3600);
    });

    it('sans cookie, jeton inconnu ou session échue : 401 session_expired', async () => {
      const none = await post('/auth/refresh');
      expect(none.status).toBe(401);
      expect(await codeOf(none)).toBe('session_expired');
      expect(await codeOf(await refresh('jeton-inconnu'))).toBe('session_expired');

      const opened = await login();
      await h.superuser(`UPDATE sessions SET expires_at = now() - interval '1 second' WHERE refresh_token_hash = $1`, [
        sha256(opened.refresh),
      ]);
      const expired = await refresh(opened.refresh);
      expect(expired.status).toBe(401);
      expect(await codeOf(expired)).toBe('session_expired');
    });

    it('rejouer un ancien jeton révoque toute la famille, et seulement elle', async () => {
      const opened = await login();
      const second = await rotate(opened.refresh);
      const third = await rotate(second.refresh);
      const other = await login();

      // Vol présumé : l'ancien jeton revient.
      const replay = await refresh(opened.refresh);
      expect(replay.status).toBe(401);
      expect(await codeOf(replay)).toBe('session_revoked');

      const family = (await sessionOf(third.refresh))?.family_id;
      const { rows } = await h.superuser(
        'SELECT count(*)::int AS live FROM sessions WHERE family_id = $1 AND revoked_at IS NULL',
        [family],
      );
      expect((rows[0] as { live: number }).live).toBe(0);

      // Le dernier jeton de la famille ne renouvelle plus, et ses jetons d'accès récents sont refusés.
      expect(await codeOf(await refresh(third.refresh))).toBe('session_revoked');
      expect(await codeOf(await logout(third.accessToken))).toBe('session_revoked');
      expect(await codeOf(await logout(second.accessToken))).toBe('session_revoked');

      // Une autre connexion de la même personne n'est pas touchée.
      expect((await sessionOf(other.refresh))?.revoked_at).toBeNull();
      await rotate(other.refresh);
    });

    it('rejeu simultané d’une rotation : aucune session de la famille ne survit', async () => {
      for (let round = 0; round < 5; round++) {
        const opened = await login();
        const second = await rotate(opened.refresh);
        const family = (await sessionOf(second.refresh))?.family_id;
        const [replay, rotation] = await Promise.all([refresh(opened.refresh), refresh(second.refresh)]);
        expect(replay.status).toBe(401);
        expect([200, 401]).toContain(rotation.status);
        const { rows } = await h.superuser(
          'SELECT count(*)::int AS live FROM sessions WHERE family_id = $1 AND revoked_at IS NULL',
          [family],
        );
        expect((rows[0] as { live: number }).live).toBe(0);
      }
    });

    it('personnel retiré : session_revoked, famille révoquée', async () => {
      const opened = await login();
      await h.superuser('DELETE FROM platform_staff WHERE user_id = $1', [OWNER.id]);
      try {
        const res = await refresh(opened.refresh);
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('session_revoked');
        expect((await sessionOf(opened.refresh))?.revoked_at).not.toBeNull();
      } finally {
        await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner')`, [OWNER.id]);
      }
    });

    it('adresse hors PLATFORM_ALLOWED_IPS au renouvellement : session_revoked', async () => {
      const opened = await login();
      const restricted = await createApp(loadConfig({ ...env, PLATFORM_ALLOWED_IPS: '203.0.113.0/24' }), {
        logger: false,
      });
      await restricted.listen(0, '127.0.0.1');
      try {
        const res = await fetch(`${await restricted.getUrl()}/api/v1/auth/refresh`, {
          method: 'POST',
          headers: { cookie: `cotiz_refresh=${opened.refresh}` },
        });
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('session_revoked');
        expect((await sessionOf(opened.refresh))?.revoked_at).not.toBeNull();
      } finally {
        await restricted.close();
      }
    });

    it('Redis indisponible pendant un rejeu : la révocation en base est quand même validée', async () => {
      const opened = await login();
      const second = await rotate(opened.refresh);
      const revoke = vi.spyOn(app.get(RevokedSessions), 'revoke').mockRejectedValue(new Error('redis coupé'));
      try {
        expect((await refresh(opened.refresh)).status).toBe(500);
      } finally {
        revoke.mockRestore();
      }
      expect((await sessionOf(second.refresh))?.revoked_at).not.toBeNull();
    });

    it('compte désactivé entre-temps : session_revoked, famille révoquée', async () => {
      const opened = await login();
      await h.superuser(`UPDATE users SET status = 'disabled' WHERE id = $1`, [OWNER.id]);
      const res = await refresh(opened.refresh);
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('session_revoked');
      expect((await sessionOf(opened.refresh))?.revoked_at).not.toBeNull();
    });
  });

  describe('auth.logout', () => {
    it('204, cookie effacé, session révoquée, jeton d’accès mis en liste noire', async () => {
      const opened = await login(true);
      const res = await logout(opened.accessToken);
      expect(res.status).toBe(204);
      const cleared = refreshOf(res);
      expect(cleared.refresh).toBe('');
      expect(cleared.cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cleared.cookie).toMatch(/Expires=Thu, 01 Jan 1970/);

      expect((await sessionOf(opened.refresh))?.revoked_at).not.toBeNull();
      expect(await codeOf(await refresh(opened.refresh))).toBe('session_revoked');
      // Le jeton d'accès (15 min) ne sert plus : liste noire du sid.
      const again = await logout(opened.accessToken);
      expect(again.status).toBe(401);
      expect(await codeOf(again)).toBe('session_revoked');
    });

    it('déconnecte aussi les jetons d’accès récents de la même connexion (rotations)', async () => {
      const opened = await login();
      const renewed = await rotate(opened.refresh);
      expect((await logout(renewed.accessToken)).status).toBe(204);
      expect(await codeOf(await logout(opened.accessToken))).toBe('session_revoked');
    });

    it('Redis indisponible : la session est quand même révoquée en base (réponse en erreur)', async () => {
      const opened = await login();
      const revoke = vi.spyOn(app.get(RevokedSessions), 'revoke').mockRejectedValue(new Error('redis coupé'));
      try {
        expect((await logout(opened.accessToken)).status).toBe(500);
      } finally {
        revoke.mockRestore();
      }
      expect((await sessionOf(opened.refresh))?.revoked_at).not.toBeNull();
      expect(await codeOf(await refresh(opened.refresh))).toBe('session_revoked');
    });

    it('sans jeton, jeton altéré ou expiré : 401 session_expired', async () => {
      const none = await post('/auth/logout');
      expect(none.status).toBe(401);
      expect(await codeOf(none)).toBe('session_expired');

      const opened = await login();
      const [header = '', payload = '', signature = ''] = opened.accessToken.split('.');
      const middle = Math.floor(signature.length / 2);
      const flipped = signature[middle] === 'A' ? 'B' : 'A';
      const forged = `${header}.${payload}.${signature.slice(0, middle)}${flipped}${signature.slice(middle + 1)}`;
      expect(await codeOf(await logout(forged))).toBe('session_expired');
      expect(await codeOf(await post('/auth/logout', { authorization: opened.accessToken }))).toBe('session_expired');
      const { sid } = decodeJwt(opened.accessToken) as { sid: string };
      const stale = await app
        .get(AccessTokenSigner)
        .sign({ sub: OWNER.id, space: 'platform', sid }, new Date(Date.now() - 16 * 60_000));
      expect(await codeOf(await logout(stale.token))).toBe('session_expired');
    });
  });
});
