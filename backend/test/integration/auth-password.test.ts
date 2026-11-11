import { Writable } from 'node:stream';
import pg from 'pg';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { LoginResponse, ResetToken } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { CliModule } from '../../src/cli/cli.module.js';
import { runCli } from '../../src/cli/commands.js';
import { type Config, loadConfig } from '../../src/config.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * Mot de passe oublié sans fournisseur (lot 1.1, étape 8) : auth.forgot, auth.verify, auth.reset, et la CLI
 * reset-password du super-admin, qui émet le code à remettre.
 */

const OLD = 'Baobab-Lagune-2026';
const NEW = 'Fromager-Plateau-2027';

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('mot de passe oublié', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let api: INestApplication;
  let cli: INestApplicationContext;
  let base: string;
  let seq = 0;

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'user-agent': 'vitest-reset', ...headers },
      body: JSON.stringify(body),
    });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

  /** Personnel plateforme actif, mot de passe OLD. */
  const staff = async (status = 'active') => {
    seq++;
    const id = `00000000-0000-7000-8000-0000000004${String(seq).padStart(2, '0')}`;
    const email = `staff${String(seq)}@cotiz.test`;
    await h.superuser(
      `INSERT INTO users (id, email, first_name, last_name, status) VALUES ($1, $2, 'Didi', 'Yao', $3)`,
      [id, email, status],
    );
    await h.superuser('INSERT INTO credentials (user_id, password_hash) VALUES ($1, $2)', [
      id,
      await new SecretHasher().hash(OLD),
    ]);
    await h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner')`, [id]);
    return { id, email };
  };

  const login = (email: string, password: string) =>
    post('/auth/login', { space: 'platform', identifier: email, password });

  /** Code de réinitialisation émis par la CLI du super-admin. */
  const cliCode = async (email: string) => {
    const out = new Capture();
    const err = new Capture();
    const status = await runCli(cli, ['reset-password', email], { out, err });
    return {
      status,
      out: out.text,
      err: err.text,
      code: /Code de réinitialisation : (\d{6})/.exec(out.text)?.[1] ?? '',
    };
  };

  const verifyCode = (email: string, code: string) =>
    post('/auth/password/verify-code', { space: 'platform', identifier: email, code });
  const tokenFor = async (email: string, code: string) => {
    const res = await verifyCode(email, code);
    expect(res.status).toBe(200);
    return ResetToken.parse(await res.json());
  };
  const reset = (resetToken: string, newPassword = NEW) => post('/auth/password/reset', { resetToken, newPassword });

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    const config: Config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
    });
    api = await createApp(config, { logger: false });
    await api.listen(0, '127.0.0.1');
    base = `${await api.getUrl()}/api/v1`;
    cli = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
  });

  afterAll(async () => {
    await Promise.all([api.close(), cli.close()]);
    await Promise.all([h.stop(), redis.stop()]);
  });

  describe('auth.forgot', () => {
    const forgot = (identifier: string, space = 'platform') => post('/auth/password/forgot', { space, identifier });
    const requestsOf = async (userId: string) =>
      (await h.superuser('SELECT * FROM password_reset_requests WHERE user_id = $1', [userId])).rows as {
        status: string;
        space: string;
        association_id: string | null;
        user_agent: string;
      }[];

    it('compte connu : 202 sans corps, demande en attente et événement', async () => {
      const { id, email } = await staff();
      const res = await forgot(email.toUpperCase());
      expect(res.status).toBe(202);
      expect(await res.text()).toBe('');
      expect(await requestsOf(id)).toMatchObject([
        { status: 'pending', space: 'platform', association_id: null, user_agent: 'vitest-reset' },
      ]);
      const { rows } = await h.superuser(
        `SELECT payload FROM outbox_events WHERE event_type = 'password_reset.requested' AND payload->>'userId' = $1`,
        [id],
      );
      expect(rows).toMatchObject([{ payload: { userId: id, associationIds: [], space: 'platform' } }]);
    });

    it('réponse identique pour un compte inconnu, non activé ou sans rôle dans l’espace (rien de créé)', async () => {
      const pending = await staff('pending_activation');
      const known = await staff();
      const responses = await Promise.all([
        forgot('inconnu@cotiz.test'),
        forgot(pending.email),
        forgot(known.email, 'subscriber'),
      ]);
      for (const res of responses) {
        expect(res.status).toBe(202);
        expect(await res.text()).toBe('');
      }
      expect(await requestsOf(pending.id)).toEqual([]);
      expect(await requestsOf(known.id)).toEqual([]);
    });

    it('demandes simultanées : jamais plus de 3', async () => {
      const { id, email } = await staff();
      await Promise.all(Array.from({ length: 8 }, () => forgot(email)));
      expect(await requestsOf(id)).toHaveLength(3);
    });

    it('demande en attente du verrou : datée après le verrou, pas au début de sa transaction', async () => {
      // Deux demandes commencées à la même microseconde avaient le même created_at (heure de début de transaction) et
      // comptaient pour une : une 4e passait. L'heure de la demande doit être lue une fois le verrou obtenu.
      const { id, email } = await staff();
      const holder = new pg.Client({ connectionString: h.db.superuserUrl });
      await holder.connect();
      try {
        await holder.query(`SELECT pg_advisory_lock(hashtextextended($1, 0))`, [`password_reset_requests:${id}`]);
        const pending = forgot(email);
        await new Promise((resolve) => setTimeout(resolve, 400));
        const [lock] = (await holder.query<{ t: Date }>('SELECT clock_timestamp() AS t')).rows;
        await holder.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [`password_reset_requests:${id}`]);
        expect((await pending).status).toBe(202);
        const [row] = (await h.superuser('SELECT created_at FROM password_reset_requests WHERE user_id = $1', [id]))
          .rows as { created_at: Date }[];
        expect(row?.created_at.getTime()).toBeGreaterThanOrEqual(lock?.t.getTime() ?? Infinity);
      } finally {
        await holder.end();
      }
    });

    it('temps de réponse plancher, compte connu ou non', async () => {
      const { email } = await staff();
      for (const identifier of [email, 'inconnu-2@cotiz.test']) {
        const t0 = performance.now();
        await (await forgot(identifier)).text();
        expect(performance.now() - t0).toBeGreaterThanOrEqual(240);
      }
    });

    it('3 demandes par 24 h : au-delà, même réponse et rien de créé', async () => {
      const { id, email } = await staff();
      for (let i = 0; i < 5; i++) expect((await forgot(email)).status).toBe(202);
      expect(await requestsOf(id)).toHaveLength(3);
    });
  });

  describe('parcours complet', () => {
    it('demande → code (CLI) → jeton → nouveau mot de passe → anciennes sessions invalides', async () => {
      const { id, email } = await staff();
      const first = LoginResponse.parse(await (await login(email, OLD)).json());
      if (first.status !== 'authenticated') throw new Error('attendu : authenticated');
      const firstCookie = (await login(email, OLD)).headers.getSetCookie()[0]?.split(';')[0] ?? '';

      expect((await post('/auth/password/forgot', { space: 'platform', identifier: email })).status).toBe(202);
      const issued = await cliCode(email);
      expect(issued.status).toBe(0);
      expect(issued.code).toMatch(/^\d{6}$/);
      expect(issued.out).toContain('15 minutes');
      expect(issued.out).toContain('https://app.cotiz.test/mot-de-passe?profil=plateforme');

      const token = await tokenFor(email, issued.code);
      // Espace de la demande : le proxy du front aiguille auth.reset d'après ce claim (bascule par espace).
      expect(decodeJwt(token.resetToken)).toMatchObject({ sub: id, space: 'platform', aud: 'cotiz-reset' });
      expect(Date.parse(token.expiresAt)).toBeLessThanOrEqual(Date.now() + 10 * 60_000 + 1_000);
      expect((await reset(token.resetToken)).status).toBe(204);

      // Anciennes sessions : jeton d'accès refusé, renouvellement refusé.
      const me = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${first.accessToken}` } });
      expect(me.status).toBe(401);
      expect(await codeOf(me)).toBe('session_revoked');
      const refresh = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { cookie: firstCookie } });
      expect(await codeOf(refresh)).toBe('session_revoked');
      const { rows: live } = await h.superuser(
        'SELECT count(*)::int AS n FROM sessions WHERE user_id = $1 AND revoked_at IS NULL',
        [id],
      );
      expect((live[0] as { n: number }).n).toBe(0);

      expect(await codeOf(await login(email, OLD))).toBe('invalid_credentials');
      expect((await login(email, NEW)).status).toBe(200);

      const { rows: requests } = await h.superuser('SELECT status FROM password_reset_requests WHERE user_id = $1', [
        id,
      ]);
      expect(requests).toEqual([{ status: 'completed' }]);
      const { rows: events } = await h.superuser(
        `SELECT payload FROM outbox_events WHERE event_type = 'user.password_changed' AND payload->>'userId' = $1`,
        [id],
      );
      expect(events).toEqual([{ payload: { userId: id } }]);
      const { rows: audit } = await h.superuser(
        `SELECT action FROM audit_logs WHERE entity_id = $1 AND action IN ('user.reset_password', 'user.issue_reset_code')`,
        [id],
      );
      expect(audit.map((a) => (a as { action: string }).action).sort()).toEqual([
        'user.issue_reset_code',
        'user.reset_password',
      ]);
      expect(JSON.stringify(audit)).not.toContain(issued.code);
    });

    it('la réinitialisation lève le verrou de connexion', async () => {
      const { email } = await staff();
      for (let i = 0; i < 5; i++) await login(email, 'mauvais-mot-de-passe');
      expect(await codeOf(await login(email, OLD))).toBe('account_locked');
      const { code } = await cliCode(email);
      expect((await reset((await tokenFor(email, code)).resetToken)).status).toBe(204);
      expect((await login(email, NEW)).status).toBe(200);
    });
  });

  describe('auth.verify', () => {
    it('5 essais : too_many_attempts au 5e, à l’identique pour un identifiant inconnu', async () => {
      const { email } = await staff();
      const { code } = await cliCode(email);
      const wrong = code === '000000' ? '111111' : '000000';
      for (const identifier of [email, 'fantome@cotiz.test']) {
        const codes: (string | undefined)[] = [];
        for (let i = 0; i < 6; i++) codes.push(await codeOf(await verifyCode(identifier, wrong)));
        expect(codes).toEqual([
          'invalid_code',
          'invalid_code',
          'invalid_code',
          'invalid_code',
          'too_many_attempts',
          'too_many_attempts',
        ]);
      }
      expect(await codeOf(await verifyCode(email, code))).toBe('too_many_attempts');
    });

    it('après une réinitialisation : mêmes réponses qu’un identifiant inconnu (aucune fuite d’existence)', async () => {
      const { email } = await staff();
      const { code } = await cliCode(email);
      expect((await reset((await tokenFor(email, code)).resetToken)).status).toBe(204);
      const wrong = code === '000000' ? '111111' : '000000';
      const sequence = async (identifier: string, value: string) => {
        const codes: (string | undefined)[] = [];
        for (let i = 0; i < 6; i++) codes.push(await codeOf(await verifyCode(identifier, value)));
        return codes;
      };
      const expected = await sequence('fantome-2@cotiz.test', wrong);
      expect(await sequence(email, wrong)).toEqual(expected);
    });

    it('code expiré : code_expired', async () => {
      const { id, email } = await staff();
      const { code } = await cliCode(email);
      await h.superuser(`UPDATE one_time_codes SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [id]);
      expect(await codeOf(await verifyCode(email, code))).toBe('code_expired');
    });
  });

  describe('auth.reset', () => {
    it('jeton à usage unique, altéré ou d’un autre usage : reset_token_invalid', async () => {
      const { email } = await staff();
      const { code } = await cliCode(email);
      const token = await tokenFor(email, code);
      expect((await reset(token.resetToken)).status).toBe(204);
      const reused = await reset(token.resetToken, 'Kapokier-Vridi-2028');
      expect(reused.status).toBe(422);
      expect(await codeOf(reused)).toBe('reset_token_invalid');

      const [header = '', payload = '', signature = ''] = token.resetToken.split('.');
      const middle = Math.floor(signature.length / 2);
      const forged = `${header}.${payload}.${signature.slice(0, middle)}${signature[middle] === 'A' ? 'B' : 'A'}${signature.slice(middle + 1)}`;
      expect(await codeOf(await reset(forged))).toBe('reset_token_invalid');

      const access = LoginResponse.parse(await (await login(email, NEW)).json());
      if (access.status !== 'authenticated') throw new Error('attendu : authenticated');
      expect(await codeOf(await reset(access.accessToken))).toBe('reset_token_invalid');
      // Et un jeton de réinitialisation n'ouvre aucune route authentifiée.
      const asBearer = await fetch(`${base}/me`, { headers: { authorization: `Bearer ${token.resetToken}` } });
      expect(asBearer.status).toBe(401);
    });

    it('un nouveau code rend caducs les jetons obtenus avec le précédent', async () => {
      const { email } = await staff();
      const first = await tokenFor(email, (await cliCode(email)).code);
      await cliCode(email);
      const res = await reset(first.resetToken);
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('reset_token_invalid');
    });

    it('mot de passe faible : weak_password, le jeton reste utilisable', async () => {
      const { email } = await staff();
      const { code } = await cliCode(email);
      const token = await tokenFor(email, code);
      const weak = await reset(token.resetToken, 'azertyuiop!');
      expect(weak.status).toBe(422);
      expect(await codeOf(weak)).toBe('weak_password');
      expect((await reset(token.resetToken)).status).toBe(204);
    });
  });

  describe('CLI reset-password', () => {
    it('adresse inconnue ou hors du personnel plateforme : refusée, aucun code', async () => {
      const unknown = await cliCode('personne@cotiz.test');
      expect(unknown.status).toBe(1);
      expect(unknown.code).toBe('');
      const { rows } = await h.superuser(`SELECT id FROM users WHERE email = 'awa@test.cotiz.app'`);
      expect(rows).toHaveLength(1);
      const notStaff = await cliCode('awa@test.cotiz.app');
      expect(notStaff.status).toBe(1);
      expect(notStaff.code).toBe('');
    });
  });
});
