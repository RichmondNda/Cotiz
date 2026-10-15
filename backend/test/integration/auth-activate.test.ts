import { Writable } from 'node:stream';
import type { INestApplication, INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AccessToken, LoginResponse } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { CliModule } from '../../src/cli/cli.module.js';
import { runCli } from '../../src/cli/commands.js';
import { type Config, loadConfig } from '../../src/config.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * auth.activate (lot 1.1, étape 7) : identifiant + code remis à la main + nouveau mot de passe → compte actif et
 * connecté. Les comptes sont créés par la vraie CLI create-platform-owner, sans aucun fournisseur.
 */

const PASSWORD = 'Lagune-Baobab-2026';

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('auth.activate', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let api: INestApplication;
  let cli: INestApplicationContext;
  let base: string;

  /** Owner plateforme en attente d'activation, créé par la CLI ; son code tel qu'affiché. */
  const createOwner = async (email: string) => {
    const out = new Capture();
    const status = await runCli(cli, ['create-platform-owner', email, 'Richy', 'Nda'], { out, err: new Capture() });
    expect(status).toBe(0);
    const code = /Code d’activation : ([2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4})/.exec(out.text)?.[1] ?? '';
    const { rows } = await h.superuser('SELECT id FROM users WHERE email = $1', [email]);
    return { code, userId: (rows[0] as { id: string }).id };
  };

  const activate = (body: Record<string, unknown>) =>
    fetch(`${base}/auth/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space: 'platform', newPassword: PASSWORD, ...body }),
    });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;
  const state = async (userId: string) =>
    (
      await h.superuser(
        `SELECT u.status, u.must_change_password, c.password_hash, c.password_changed_at,
                o.attempts, o.consumed_at
           FROM users u JOIN credentials c ON c.user_id = u.id
           JOIN one_time_codes o ON o.user_id = u.id AND o.purpose = 'activation'
          WHERE u.id = $1 ORDER BY o.created_at DESC LIMIT 1`,
        [userId],
      )
    ).rows[0] as {
      status: string;
      must_change_password: boolean;
      password_hash: string | null;
      password_changed_at: Date | null;
      attempts: number;
      consumed_at: Date | null;
    };

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

  it('l’owner créé par la CLI s’active (connecté directement), puis se connecte avec son mot de passe', async () => {
    const { code, userId } = await createOwner('owner-activation@cotiz.test');
    // Avant l'activation : aucune connexion possible.
    const before = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space: 'platform', identifier: 'owner-activation@cotiz.test', password: PASSWORD }),
    });
    expect(await codeOf(before)).toBe('invalid_credentials');

    const res = await activate({ identifier: 'Owner-Activation@cotiz.test', code: code.toLowerCase() });
    expect(res.status).toBe(200);
    const body = AccessToken.parse(await res.json());
    expect(body.space).toBe('platform');
    expect(decodeJwt(body.accessToken)).toMatchObject({ sub: userId, space: 'platform' });
    expect(res.headers.getSetCookie().some((c) => c.startsWith('cotiz_refresh=') && c.includes('HttpOnly'))).toBe(true);

    const after = await state(userId);
    expect(after).toMatchObject({ status: 'active', must_change_password: false, attempts: 0 });
    expect(after.password_hash).toMatch(/^\$argon2id\$/);
    expect(after.password_changed_at).not.toBeNull();
    expect(after.consumed_at).not.toBeNull();
    const { rows: codes } = await h.superuser('SELECT code_encrypted FROM one_time_codes WHERE user_id = $1', [userId]);
    expect(codes.every((c) => (c as { code_encrypted: unknown }).code_encrypted === null)).toBe(true);

    const { rows: events } = await h.superuser(
      `SELECT payload, actor_user_id FROM outbox_events WHERE event_type = 'user.activated' AND payload->>'userId' = $1`,
      [userId],
    );
    expect(events).toEqual([{ payload: { userId, associationIds: [] }, actor_user_id: userId }]);
    const { rows: audit } = await h.superuser(
      `SELECT action, actor_user_id FROM audit_logs WHERE entity_type = 'user' AND entity_id = $1 AND action = 'user.activate'`,
      [userId],
    );
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(code.replace('-', ''));

    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ space: 'platform', identifier: 'owner-activation@cotiz.test', password: PASSWORD }),
    });
    expect(login.status).toBe(200);
    expect(LoginResponse.parse(await login.json()).status).toBe('authenticated');
  });

  it('code réutilisé : already_activated avec ce code (preuve), invalid_code avec un autre', async () => {
    const { code } = await createOwner('owner-reuse@cotiz.test');
    expect((await activate({ identifier: 'owner-reuse@cotiz.test', code })).status).toBe(200);
    const again = await activate({ identifier: 'owner-reuse@cotiz.test', code });
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe('already_activated');
    const other = code === 'ABCD-EFGH' ? 'HGFE-DCBA' : 'ABCD-EFGH';
    expect(await codeOf(await activate({ identifier: 'owner-reuse@cotiz.test', code: other }))).toBe('invalid_code');
  });

  it('code expiré : code_expired, compte toujours en attente', async () => {
    const { code, userId } = await createOwner('owner-expired@cotiz.test');
    await h.superuser(`UPDATE one_time_codes SET expires_at = now() - interval '1 second' WHERE user_id = $1`, [
      userId,
    ]);
    const res = await activate({ identifier: 'owner-expired@cotiz.test', code });
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe('code_expired');
    expect((await state(userId)).status).toBe('pending_activation');
  });

  it('6e essai refusé même avec le bon code ; les essais sont comptés en base malgré les erreurs', async () => {
    const { code, userId } = await createOwner('owner-attempts@cotiz.test');
    const wrong = code === 'ABCD-EFGH' ? 'HGFE-DCBA' : 'ABCD-EFGH';
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 5; i++)
      codes.push(await codeOf(await activate({ identifier: 'owner-attempts@cotiz.test', code: wrong })));
    expect(codes).toEqual(['invalid_code', 'invalid_code', 'invalid_code', 'invalid_code', 'too_many_attempts']);
    expect((await state(userId)).attempts).toBe(5);

    const sixth = await activate({ identifier: 'owner-attempts@cotiz.test', code });
    expect(sixth.status).toBe(423);
    expect(await codeOf(sixth)).toBe('too_many_attempts');
    expect((await state(userId)).status).toBe('pending_activation');
  });

  it('mot de passe faible : weak_password, ni essai compté ni code consommé', async () => {
    const { code, userId } = await createOwner('owner-weak@cotiz.test');
    for (const newPassword of ['Baobab-26', 'azertyuiop', 'owner-weak@cotiz.test!']) {
      const res = await activate({ identifier: 'owner-weak@cotiz.test', code, newPassword });
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('weak_password');
    }
    expect(await state(userId)).toMatchObject({ status: 'pending_activation', attempts: 0, consumed_at: null });
  });

  it('identifiant inconnu : mêmes réponses qu’un compte connu, too_many_attempts au 5e essai (rien n’est révélé)', async () => {
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++)
      codes.push(await codeOf(await activate({ identifier: 'personne@cotiz.test', code: 'K7M4-P9QX' })));
    expect(codes).toEqual([
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'too_many_attempts',
      'too_many_attempts',
    ]);
  });

  it('compte désactivé, bon code : invalid_code, ni activé ni code consommé', async () => {
    const { code, userId } = await createOwner('owner-disabled@cotiz.test');
    await h.superuser(`UPDATE users SET status = 'disabled' WHERE id = $1`, [userId]);
    const res = await activate({ identifier: 'owner-disabled@cotiz.test', code });
    expect(await codeOf(res)).toBe('invalid_code');
    expect(await state(userId)).toMatchObject({ status: 'disabled', consumed_at: null });
  });

  it('deux activations simultanées avec le même code : une seule réussit, l’autre already_activated', async () => {
    const { code, userId } = await createOwner('owner-race@cotiz.test');
    const results = await Promise.all([
      activate({ identifier: 'owner-race@cotiz.test', code }),
      activate({ identifier: 'owner-race@cotiz.test', code }),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const { rows } = await h.superuser(
      `SELECT (SELECT count(*)::int FROM sessions WHERE user_id = $1) AS sessions,
              (SELECT count(*)::int FROM outbox_events WHERE event_type = 'user.activated' AND payload->>'userId' = $1::text) AS events`,
      [userId],
    );
    expect(rows[0]).toEqual({ sessions: 1, events: 1 });
  });

  it('espace sans rôle, bon code : wrong_space, sans consommer le code ni activer', async () => {
    const { code, userId } = await createOwner('owner-space@cotiz.test');
    const res = await activate({ identifier: 'owner-space@cotiz.test', code, space: 'association' });
    expect(res.status).toBe(401);
    expect(await codeOf(res)).toBe('wrong_space');
    expect(await state(userId)).toMatchObject({ status: 'pending_activation', consumed_at: null });
    expect((await activate({ identifier: 'owner-space@cotiz.test', code })).status).toBe(200);
  });
});
