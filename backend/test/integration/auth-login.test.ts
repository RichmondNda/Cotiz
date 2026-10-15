import { createHash } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { decodeProtectedHeader, jwtVerify } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { type Config, loadConfig } from '../../src/config.js';
import { AccessTokenSigner } from '../../src/modules/identity/infra/access-token-signer.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * auth.login (lot 1.1, étape 2) contre de vrais PostgreSQL et Redis : argon2id, espace vérifié, verrouillage
 * 5 échecs / 15 min, aucune fuite d'existence de compte, JWT EdDSA 15 min et jeton de renouvellement en cookie.
 */

const PASSWORD = 'Baobab-Lagune-2026';
const OWNER = { id: '00000000-0000-7000-8000-0000000001a1', email: 'owner@cotiz.test' };
const MANAGER = { id: '00000000-0000-7000-8000-0000000001a2', email: 'gestion@cotiz.test' };
const PENDING = { id: '00000000-0000-7000-8000-0000000001a3', email: 'attente@cotiz.test' };
/** Personnel plateforme avec email ET téléphone : un seul compte, donc 5 essais en tout. */
const DUAL = { id: '00000000-0000-7000-8000-0000000001a4', email: 'double@cotiz.test', phone: '+2250700000001' };

describe('auth.login', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;

  const env = (redisUrl: string, extra: Record<string, string> = {}): Config =>
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redisUrl,
      S3_ENDPOINT: 'http://127.0.0.1:1',
      // Beaucoup de connexions depuis la même IP dans ce fichier.
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
      ...extra,
    });

  const start = async (config: Config) => {
    const started = await createApp(config, { logger: false });
    await started.listen(0, '127.0.0.1');
    return { app: started, base: `${await started.getUrl()}/api/v1` };
  };

  const login = (body: Record<string, unknown>, at = base) =>
    fetch(`${at}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest-login' },
      body: JSON.stringify(body),
    });

  const platform = (identifier: string, password = PASSWORD) => ({ space: 'platform', identifier, password });

  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

  const credentialsOf = async (userId: string) =>
    (await h.superuser('SELECT failed_attempts, locked_until FROM credentials WHERE user_id = $1', [userId]))
      .rows[0] as { failed_attempts: number; locked_until: Date | null };

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    const passwordHash = await new SecretHasher().hash(PASSWORD);
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status, must_change_password) VALUES
         ($1, $2, 'Richy', 'Nda', 'active', false),
         ($3, $4, 'Awa', 'Koné', 'active', false),
         ($5, $6, 'Ali', 'Traoré', 'pending_activation', true)`,
      [OWNER.id, OWNER.email, MANAGER.id, MANAGER.email, PENDING.id, PENDING.email],
    );
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $4), ($2, $4), ($3, NULL)`, [
      OWNER.id,
      MANAGER.id,
      PENDING.id,
      passwordHash,
    ]);
    await h.superuser(
      `INSERT INTO users (id, email, phone_e164, first_name, last_name, status) VALUES ($1, $2, $3, 'Didi', 'Yao', 'active')`,
      [DUAL.id, DUAL.email, DUAL.phone],
    );
    await h.superuser(`INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)`, [DUAL.id, passwordHash]);
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner'), ($2, 'admin')`, [
      OWNER.id,
      DUAL.id,
    ]);
    ({ app, base } = await start(env(redis.getConnectionUrl())));
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  // Chaque test part sans compteur d'échecs ni verrou.
  beforeEach(async () => {
    await redis.exec(['redis-cli', 'FLUSHALL']);
    await h.superuser('UPDATE credentials SET failed_attempts = 0, locked_until = NULL');
  });

  describe('bon mot de passe', () => {
    it('ouvre une session : JWT EdDSA de 15 min, cookie de renouvellement, session hachée, événement', async () => {
      const before = Date.now();
      const res = await login({ ...platform('Owner@Cotiz.test'), rememberMe: true });
      expect(res.status).toBe(200);
      const body = LoginResponse.parse(await res.json());
      if (body.status !== 'authenticated') throw new Error('attendu : authenticated');
      expect(body.space).toBe('platform');

      // Jeton d'accès : EdDSA, claims sub / space / sid, 15 min, vérifiable avec la clé publique de l'api.
      expect(decodeProtectedHeader(body.accessToken)).toMatchObject({ alg: 'EdDSA', typ: 'JWT' });
      const { payload } = await jwtVerify(body.accessToken, app.get(AccessTokenSigner).publicKey(), {
        issuer: 'cotiz',
        audience: 'cotiz-api',
      });
      expect(payload).toMatchObject({ sub: OWNER.id, space: 'platform' });
      expect(payload.aid).toBeUndefined();
      expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(15 * 60);
      expect(Date.parse(body.expiresAt)).toBe((payload.exp ?? 0) * 1000);
      expect(Date.parse(body.expiresAt)).toBeGreaterThanOrEqual(before + 15 * 60_000 - 2_000);

      // Jeton de renouvellement : cookie HttpOnly, jamais dans le corps.
      const cookie = res.headers.getSetCookie().find((c) => c.startsWith('cotiz_refresh=')) ?? '';
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=Lax/);
      expect(cookie).toMatch(/; Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/; Max-Age=2592000/);
      const refresh = /^cotiz_refresh=([^;]+)/.exec(cookie)?.[1] ?? '';
      expect(Buffer.from(refresh, 'base64url')).toHaveLength(32);
      expect(JSON.stringify(body)).not.toContain(refresh);

      // Session : id = sid, jeton haché (SHA-256), 30 jours, IP et navigateur.
      const { rows } = await h.superuser('SELECT * FROM sessions WHERE id = $1', [payload.sid]);
      expect(rows[0]).toMatchObject({
        user_id: OWNER.id,
        space: 'platform',
        refresh_token_hash: createHash('sha256').update(refresh).digest('hex'),
        user_agent: 'vitest-login',
        ip: '127.0.0.1',
        revoked_at: null,
      });
      const session = rows[0] as { family_id: string; expires_at: Date };
      expect(session.family_id).not.toBe(payload.sid);
      expect(session.expires_at.getTime()).toBeGreaterThanOrEqual(before + 30 * 86_400_000 - 2_000);

      const { rows: events } = await h.superuser(
        `SELECT payload, association_id, actor_user_id FROM outbox_events
          WHERE event_type = 'user.logged_in' AND payload->>'userId' = $1`,
        [OWNER.id],
      );
      expect(events.at(-1)).toEqual({
        payload: { userId: OWNER.id, space: 'platform' },
        association_id: null,
        actor_user_id: OWNER.id,
      });
      const { rows: users } = await h.superuser('SELECT last_login_at FROM users WHERE id = $1', [OWNER.id]);
      expect((users[0] as { last_login_at: Date }).last_login_at.getTime()).toBeGreaterThanOrEqual(before - 1_000);
    });

    it('sans « rester connecté » : cookie de session (ni Max-Age ni Expires)', async () => {
      const res = await login(platform(OWNER.email));
      expect(res.status).toBe(200);
      const cookie = res.headers.getSetCookie().find((c) => c.startsWith('cotiz_refresh=')) ?? '';
      expect(cookie).not.toBe('');
      expect(cookie).not.toMatch(/Max-Age|Expires/i);
    });

    it('remet le compteur d’échecs à zéro', async () => {
      await login(platform(OWNER.email, 'mauvais'));
      await login(platform(OWNER.email, 'mauvais'));
      expect((await credentialsOf(OWNER.id)).failed_attempts).toBe(2);
      expect((await login(platform(OWNER.email))).status).toBe(200);
      expect(await credentialsOf(OWNER.id)).toEqual({ failed_attempts: 0, locked_until: null });
      // Le compteur Redis aussi : 4 nouveaux échecs ne verrouillent pas.
      for (let i = 0; i < 4; i++) expect((await login(platform(OWNER.email, 'mauvais'))).status).toBe(401);
    });
  });

  describe('échecs, sans fuite d’existence', () => {
    it('mauvais mot de passe : 401 invalid_credentials, échec compté (validé malgré l’erreur)', async () => {
      const res = await login(platform(OWNER.email, 'mauvais'));
      expect(res.status).toBe(401);
      expect(res.headers.get('content-type')).toMatch(/application\/problem\+json/);
      expect(await codeOf(res)).toBe('invalid_credentials');
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(await credentialsOf(OWNER.id)).toEqual({ failed_attempts: 1, locked_until: null });
    });

    it('compte inconnu : même réponse', async () => {
      const res = await login(platform('personne@cotiz.test', 'mauvais'));
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('invalid_credentials');
    });

    it('compte non activé (sans mot de passe) : invalid_credentials, jamais account_not_activated', async () => {
      const res = await login(platform(PENDING.email, ''.padEnd(10, 'x')));
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('invalid_credentials');
    });

    it('espace sans rôle, bon mot de passe : 401 wrong_space, aucune session', async () => {
      const count = async () =>
        ((await h.superuser('SELECT count(*)::int AS n FROM sessions')).rows[0] as { n: number }).n;
      const sessions = await count();
      for (const space of ['association', 'subscriber']) {
        const res = await login({ space, identifier: OWNER.email, password: PASSWORD });
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('wrong_space');
      }
      // Gestionnaire sans place au personnel de la plateforme.
      const res = await login(platform(MANAGER.email));
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('wrong_space');
      expect(await count()).toBe(sessions);
      // Le mot de passe était bon : pas un échec.
      expect((await credentialsOf(MANAGER.id)).failed_attempts).toBe(0);
    });

    it('espace sans rôle, mauvais mot de passe : invalid_credentials (wrong_space suppose le mot de passe)', async () => {
      const res = await login({ space: 'association', identifier: OWNER.email, password: 'mauvais' });
      expect(await codeOf(res)).toBe('invalid_credentials');
    });

    it('compte inconnu ou sans mot de passe : argon2id vérifié quand même (haché fictif)', async () => {
      // Le seuil de ± 50 ms du lot ne suffit pas à le prouver : argon2id prend moins de 50 ms sur une machine rapide.
      const verify = vi.spyOn(app.get(SecretHasher), 'verify');
      try {
        for (const identifier of ['inconnu@cotiz.test', PENDING.email]) {
          verify.mockClear();
          await (await login(platform(identifier, 'mauvais'))).arrayBuffer();
          expect(verify).toHaveBeenCalledTimes(1);
          expect(verify.mock.calls[0]?.[0]).toMatch(/^\$argon2id\$/);
        }
      } finally {
        verify.mockRestore();
      }
    });

    it('mêmes en-têtes pour un compte connu et un identifiant inconnu (401 puis 423)', async () => {
      const headerNames = (res: Response) =>
        [...res.headers.keys()].filter((name) => !['date', 'x-request-id', 'content-length'].includes(name)).sort();
      const known = await login(platform(OWNER.email, 'mauvais'));
      const unknown = await login(platform('inconnu@cotiz.test', 'mauvais'));
      expect(headerNames(known)).toEqual(headerNames(unknown));
      const withoutRequestId = async (res: Response) => {
        const { requestId: _, ...rest } = (await res.json()) as Record<string, unknown>;
        return rest;
      };
      expect(await withoutRequestId(known)).toEqual(await withoutRequestId(unknown));
      for (let i = 0; i < 4; i++) {
        await login(platform(OWNER.email, 'mauvais'));
        await login(platform('inconnu@cotiz.test', 'mauvais'));
      }
      const knownLocked = await login(platform(OWNER.email, 'mauvais'));
      const unknownLocked = await login(platform('inconnu@cotiz.test', 'mauvais'));
      expect([knownLocked.status, unknownLocked.status]).toEqual([423, 423]);
      expect(headerNames(knownLocked)).toEqual(headerNames(unknownLocked));
    });

    // Un succès (session écrite, jeton signé) est légitimement plus long et ne révèle rien : seuls les échecs comptent.
    it('même temps de réponse (± 50 ms) : mauvais mot de passe, compte inconnu, compte non activé', async () => {
      const cases = {
        wrong: platform(OWNER.email, 'mauvais'),
        unknown: platform('inconnu@cotiz.test', 'mauvais'),
        pending: platform(PENDING.email, 'mauvais'),
      };
      const times: Record<keyof typeof cases, number[]> = { wrong: [], unknown: [], pending: [] };
      // Échantillons entrelacés : une variation de charge de la machine touche tous les cas à la fois.
      for (let round = 0; round < 10; round++) {
        for (const [name, body] of Object.entries(cases) as [keyof typeof cases, Record<string, unknown>][]) {
          // Pas de verrouillage pendant la mesure.
          await redis.exec(['redis-cli', 'FLUSHALL']);
          const t0 = performance.now();
          await (await login(body)).arrayBuffer();
          // Premier tour : préchauffage (connexions du pool, compilation), non retenu.
          if (round > 0) times[name].push(performance.now() - t0);
        }
      }
      const median = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
      const [wrong, unknown, pending] = [median(times.wrong), median(times.unknown), median(times.pending)];
      expect(Math.abs(wrong - unknown)).toBeLessThan(50);
      expect(Math.abs(wrong - pending)).toBeLessThan(50);
    });
  });

  describe('verrouillage : 5 échecs → 15 min', () => {
    it('compte connu : le 5e échec verrouille, puis même le bon mot de passe est refusé (423)', async () => {
      for (let i = 1; i <= 4; i++) {
        const res = await login(platform(OWNER.email, 'mauvais'));
        expect(await codeOf(res)).toBe('invalid_credentials');
      }
      const fifth = await login(platform(OWNER.email, 'mauvais'));
      expect(fifth.status).toBe(423);
      expect(await codeOf(fifth)).toBe('account_locked');

      const locked = await credentialsOf(OWNER.id);
      expect(locked.failed_attempts).toBe(5);
      const until = locked.locked_until?.getTime() ?? 0;
      expect(until).toBeGreaterThan(Date.now() + 14 * 60_000);
      expect(until).toBeLessThanOrEqual(Date.now() + 15 * 60_000 + 1_000);

      const correct = await login(platform(OWNER.email));
      expect(correct.status).toBe(423);
      expect(await codeOf(correct)).toBe('account_locked');
    });

    it('identifiant inconnu : verrouillé de la même façon', async () => {
      const codes: (string | undefined)[] = [];
      for (let i = 1; i <= 6; i++) codes.push(await codeOf(await login(platform('fantome@cotiz.test', 'mauvais'))));
      expect(codes).toEqual([
        'invalid_credentials',
        'invalid_credentials',
        'invalid_credentials',
        'invalid_credentials',
        'account_locked',
        'account_locked',
      ]);
    });

    it('requêtes simultanées : jamais plus de 5 essais de mot de passe', async () => {
      const verify = vi.spyOn(app.get(SecretHasher), 'verify');
      try {
        for (const identifier of [OWNER.email, 'rafale@cotiz.test']) {
          verify.mockClear();
          const responses = await Promise.all(Array.from({ length: 20 }, () => login(platform(identifier, 'mauvais'))));
          const statuses = responses.map((res) => res.status);
          expect(verify.mock.calls.length).toBeLessThanOrEqual(5);
          expect(statuses.filter((status) => status === 423).length).toBeGreaterThanOrEqual(15);
          expect(statuses.every((status) => status === 401 || status === 423)).toBe(true);
        }
        expect(await codeOf(await login(platform(OWNER.email)))).toBe('account_locked');
      } finally {
        verify.mockRestore();
      }
    });

    it('email et téléphone d’un même compte partagent leurs 5 essais', async () => {
      for (let i = 1; i <= 3; i++) expect((await login(platform(DUAL.email, 'mauvais'))).status).toBe(401);
      expect((await login(platform(DUAL.phone, 'mauvais'))).status).toBe(401);
      const fifth = await login(platform(DUAL.phone, 'mauvais'));
      expect(await codeOf(fifth)).toBe('account_locked');
      expect(await codeOf(await login(platform(DUAL.email)))).toBe('account_locked');
      expect(await codeOf(await login(platform(DUAL.phone)))).toBe('account_locked');
    });

    it('le verrou tient même si Redis l’a perdu (locked_until en base)', async () => {
      for (let i = 1; i <= 5; i++) await login(platform(OWNER.email, 'mauvais'));
      await redis.exec(['redis-cli', 'FLUSHALL']);
      expect(await codeOf(await login(platform(OWNER.email)))).toBe('account_locked');
    });

    it('verrou échu : la connexion repasse', async () => {
      await h.superuser(
        `UPDATE credentials SET failed_attempts = 5, locked_until = now() - interval '1 second' WHERE user_id = $1`,
        [OWNER.id],
      );
      expect((await login(platform(OWNER.email))).status).toBe(200);
    });

    it('un identifiant verrouillé ne verrouille pas les autres', async () => {
      for (let i = 1; i <= 5; i++) await login(platform('fantome@cotiz.test', 'mauvais'));
      expect((await login(platform(OWNER.email))).status).toBe(200);
    });
  });

  it('IP hors de PLATFORM_ALLOWED_IPS : wrong_space pour l’espace plateforme', async () => {
    const restricted = await start(env(redis.getConnectionUrl(), { PLATFORM_ALLOWED_IPS: '203.0.113.0/24' }));
    try {
      const res = await login(platform(OWNER.email), restricted.base);
      expect(res.status).toBe(401);
      expect(await codeOf(res)).toBe('wrong_space');
    } finally {
      await restricted.app.close();
    }
    const open = await start(env(redis.getConnectionUrl(), { PLATFORM_ALLOWED_IPS: '127.0.0.1, 10.0.0.0/8' }));
    try {
      expect((await login(platform(OWNER.email), open.base)).status).toBe(200);
    } finally {
      await open.app.close();
    }
  });

  it('corps invalide : 422 validation_failed, sans la valeur reçue', async () => {
    const res = await login({ space: 'platform', identifier: 'pas-un-identifiant', password: PASSWORD });
    expect(res.status).toBe(422);
    const text = await res.text();
    expect(text).toContain('validation_failed');
    expect(text).not.toContain(PASSWORD);
  });

  it('Redis indisponible : connexion refusée (429), jamais d’essais sans compteur', async () => {
    const down = await start(env('redis://127.0.0.1:1'));
    try {
      const res = await login(platform(OWNER.email), down.base);
      expect(res.status).toBe(429);
    } finally {
      await down.app.close();
    }
  });
});
