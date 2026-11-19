import { AccessToken, LoginResponse } from '@cotiz/contracts';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { base32Decode, hotp, totpStep } from '../../src/modules/identity/domain/totp.js';
import { AccessTokenSigner } from '../../src/modules/identity/infra/access-token-signer.js';
import { RedisClient } from '../../src/shared/redis/redis.module.js';
import { forgetUsedTotpSteps, platformLogin, totpNow, totpSecretOf } from '../support/platform-mfa.js';
import {
  codeOf,
  PASSWORD,
  type PlatformFixture,
  STAFF,
  startPlatformFixture,
} from './platform-associations.fixture.js';

/**
 * auth.mfa (lot 4.7, étape 1) : second facteur TOTP obligatoire pour le personnel de la plateforme. Vérification de
 * l'étape : « sans second facteur, un compte plateforme ne se connecte plus » (session restreinte à l'enrôlement).
 * Les tests s'enchaînent : le facteur du propriétaire, confirmé au deuxième, sert aux suivants.
 */

const OWNER = STAFF.owner;
const SUPPORT = STAFF.support;

describe('auth.mfa : double authentification de la plateforme', () => {
  let f: PlatformFixture;
  let ownerSecret = '';
  let ownerRecoveryCodes: string[] = [];

  const post = (path: string, body: unknown, token?: string, headers: Record<string, string> = {}) =>
    f.call(path, { method: 'POST', body, ...(token ? { token } : {}), headers });

  const rawLogin = async (email: string, rememberMe = false) => {
    const res = await post('/auth/login', { space: 'platform', identifier: email, password: PASSWORD, rememberMe });
    expect(res.status).toBe(200);
    return { res, body: LoginResponse.parse(await res.json()) };
  };

  const factorsOf = async (userId: string) =>
    (
      await f.h.superuser(
        'SELECT confirmed_at, recovery_code_hashes, secret_encrypted FROM mfa_factors WHERE user_id = $1',
        [userId],
      )
    ).rows as { confirmed_at: Date | null; recovery_code_hashes: string[]; secret_encrypted: Buffer }[];

  const sessionsOf = async (userId: string) =>
    (
      (await f.h.superuser('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [userId])).rows[0] as {
        n: number;
      }
    ).n;

  const mfaRequired = async (email: string, rememberMe = false) => {
    const { body } = await rawLogin(email, rememberMe);
    if (body.status !== 'mfa_required') throw new Error(`attendu : mfa_required (${body.status})`);
    return body.mfaToken;
  };

  /** Un code de 6 chiffres différent du code du moment. */
  const wrongCode = () => (totpNow(ownerSecret) === '000000' ? '111111' : '000000');

  beforeAll(async () => {
    f = await startPlatformFixture();
  });

  afterAll(async () => {
    await f.stop();
  });

  beforeEach(async () => {
    const redis = f.app.get(RedisClient).redis;
    const keys = await redis.keys('cotiz:mfa:failures:*');
    if (keys.length > 0) await redis.del(...keys);
  });

  describe('sans second facteur : session restreinte à l’enrôlement', () => {
    it('le compte plateforme ne se connecte plus : jeton restreint, routes plateforme et profil 403, /me 200', async () => {
      const { body } = await rawLogin(SUPPORT.email);
      if (body.status !== 'authenticated') throw new Error('attendu : authenticated (restreinte)');
      expect(decodeJwt(body.accessToken).mfa).toBe('enroll');
      const platform = await f.call('/platform/associations', { token: body.accessToken });
      expect(platform.status).toBe(403);
      expect(await codeOf(platform)).toBe('forbidden');
      expect((await f.call('/platform/dashboard', { token: body.accessToken })).status).toBe(403);
      expect((await f.call('/me', { token: body.accessToken })).status).toBe(200);
      // Ni profil ni mot de passe avant la preuve du second facteur.
      expect((await f.call('/me/profile', { token: body.accessToken })).status).toBe(403);
      expect((await post('/auth/logout', undefined, body.accessToken)).status).toBe(204);
    });

    it('enrôlement → confirmation (10 codes de secours hachés, événement, audit) → renouvellement complet', async () => {
      const { res, body } = await rawLogin(OWNER.email);
      if (body.status !== 'authenticated') throw new Error('attendu : authenticated (restreinte)');
      const cookie = /^(cotiz_refresh=[^;]*)/.exec(res.headers.getSetCookie()[0] ?? '')?.[1] ?? '';
      const token = body.accessToken;
      // Autre connexion restreinte ouverte avec le seul mot de passe (autre poste, ou quelqu'un qui le connaît).
      const other = await rawLogin(OWNER.email);
      if (other.body.status !== 'authenticated') throw new Error('attendu : authenticated (restreinte)');
      const otherCookie = /^(cotiz_refresh=[^;]*)/.exec(other.res.headers.getSetCookie()[0] ?? '')?.[1] ?? '';

      expect((await post('/me/mfa/totp', {})).status).toBe(401);
      const enroll = await post('/me/mfa/totp', {}, token);
      expect(enroll.status).toBe(201);
      const first = (await enroll.json()) as { secret: string; otpauthUrl: string };
      expect(first.otpauthUrl).toMatch(/^otpauth:\/\/totp\/Cotiz:richy%40cotiz\.test\?secret=/);
      // Un second enrôlement remplace le premier, non confirmé : l'ancien secret ne vaut plus rien.
      const { secret } = (await (await post('/me/mfa/totp', {}, token)).json()) as { secret: string };
      expect(secret).not.toBe(first.secret);
      const pending = await factorsOf(OWNER.id);
      expect(pending).toHaveLength(1);
      expect(pending[0]?.confirmed_at).toBeNull();
      expect(pending[0]?.secret_encrypted.toString('latin1')).not.toContain(secret);

      ownerSecret = secret;
      const wrong = await post('/me/mfa/totp/confirm', { code: wrongCode() }, token);
      expect(wrong.status).toBe(422);
      expect(await codeOf(wrong)).toBe('invalid_code');
      if (totpNow(first.secret) !== totpNow(secret)) {
        expect((await post('/me/mfa/totp/confirm', { code: totpNow(first.secret) }, token)).status).toBe(422);
      }

      await forgetUsedTotpSteps(f.app);
      const confirm = await post('/me/mfa/totp/confirm', { code: totpNow(secret) }, token);
      expect(confirm.status).toBe(200);
      const { recoveryCodes } = (await confirm.json()) as { recoveryCodes: string[] };
      expect(recoveryCodes).toHaveLength(10);
      const [factor] = await factorsOf(OWNER.id);
      expect(factor?.confirmed_at).not.toBeNull();
      expect(factor?.recovery_code_hashes).toHaveLength(10);
      const stored = factor?.recovery_code_hashes.join(' ') ?? '';
      for (const code of recoveryCodes) expect(stored).not.toContain(code.replace('-', ''));

      const event = await f.h.superuser(
        `SELECT payload FROM outbox_events WHERE event_type = 'user.mfa_enabled' AND aggregate_id = $1`,
        [OWNER.id],
      );
      expect(event.rows).toEqual([{ payload: { userId: OWNER.id } }]);
      const audit = await f.h.superuser(
        `SELECT actor_user_id, entity_id FROM audit_logs WHERE action = 'user.mfa_enable'`,
      );
      expect(audit.rows).toEqual([{ actor_user_id: OWNER.id, entity_id: OWNER.id }]);

      // Déjà confirmé : ni nouvel enrôlement ni nouvelle confirmation.
      expect(await codeOf(await post('/me/mfa/totp', {}, token))).toBe('invalid_state');
      expect(await codeOf(await post('/me/mfa/totp/confirm', { code: totpNow(secret) }, token))).toBe('invalid_state');

      // L'autre connexion n'a jamais prouvé le code : révoquée à la confirmation, jamais complète.
      const stolen = await post('/auth/refresh', undefined, undefined, { cookie: otherCookie });
      expect(stolen.status).toBe(401);
      expect(await codeOf(stolen)).toBe('session_revoked');
      expect(await codeOf(await f.call('/me', { token: other.body.accessToken }))).toBe('session_revoked');

      // Le jeton en cours reste restreint ; le renouvellement donne un jeton complet.
      expect((await f.call('/platform/associations', { token })).status).toBe(403);
      const refreshed = await post('/auth/refresh', undefined, undefined, { cookie });
      expect(refreshed.status).toBe(200);
      const full = AccessToken.parse(await refreshed.json());
      expect(decodeJwt(full.accessToken).mfa).toBeUndefined();
      expect((await f.call('/platform/associations', { token: full.accessToken })).status).toBe(200);
      const profile = (await (await f.call('/me/profile', { token: full.accessToken })).json()) as {
        mfaEnabled: boolean;
      };
      expect(profile.mfaEnabled).toBe(true);
      ownerRecoveryCodes = recoveryCodes;
    });

    it('enrôlement réservé aux sessions plateforme : jeton association 403', async () => {
      const { token } = await f.app.get(AccessTokenSigner).sign({
        sub: OWNER.id,
        space: 'association',
        sid: '00000000-0000-7000-8000-0000000017a1',
      });
      const res = await post('/me/mfa/totp', {}, token);
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe('forbidden');
    });
  });

  describe('avec un second facteur confirmé', () => {
    it('connexion : mfa_required, aucune session ni cookie avant le code', async () => {
      const before = await sessionsOf(OWNER.id);
      const { res, body } = await rawLogin(OWNER.email);
      expect(body.status).toBe('mfa_required');
      expect(res.headers.getSetCookie()).toEqual([]);
      expect(await sessionsOf(OWNER.id)).toBe(before);
    });

    it('code juste : session complète, cookie persistant (« rester connecté ») ; rejeu du même code refusé', async () => {
      const mfaToken = await mfaRequired(OWNER.email, true);
      await forgetUsedTotpSteps(f.app);
      const code = totpNow(ownerSecret);
      const res = await post('/auth/mfa/verify', { mfaToken, code });
      expect(res.status).toBe(200);
      const body = AccessToken.parse(await res.json());
      expect(body.space).toBe('platform');
      expect(decodeJwt(body.accessToken).mfa).toBeUndefined();
      expect(res.headers.getSetCookie()[0]).toMatch(/Max-Age=/);
      expect((await f.call('/platform/associations', { token: body.accessToken })).status).toBe(200);

      const replay = await post('/auth/mfa/verify', { mfaToken: await mfaRequired(OWNER.email), code });
      expect(replay.status).toBe(422);
      expect(await codeOf(replay)).toBe('invalid_code');

      // Jeton de second facteur à usage unique : avec un autre code valable (pas suivant), il n'ouvre rien de plus.
      await forgetUsedTotpSteps(f.app);
      const next = hotp(base32Decode(ownerSecret), totpStep(new Date()) + 1);
      const again = await post('/auth/mfa/verify', { mfaToken, code: next });
      expect(again.status).toBe(401);
      expect(await codeOf(again)).toBe('session_expired');
      // Jamais un jeton d'accès : en Bearer, refusé.
      expect((await f.call('/me', { token: mfaToken })).status).toBe(401);
    });

    it('pas voisin (− 30 s) accepté, au-delà de la fenêtre refusé', async () => {
      const secret = base32Decode(ownerSecret);
      const step = totpStep(new Date());
      await forgetUsedTotpSteps(f.app);
      const far = await post('/auth/mfa/verify', {
        mfaToken: await mfaRequired(OWNER.email),
        code: hotp(secret, step - 3),
      });
      expect(await codeOf(far)).toBe('invalid_code');
      const near = await post('/auth/mfa/verify', {
        mfaToken: await mfaRequired(OWNER.email),
        code: hotp(secret, step - 1),
      });
      expect(near.status).toBe(200);
    });

    it('20 codes faux simultanés : jamais plus de 5 évalués (4 invalid_code, puis too_many_attempts)', async () => {
      const mfaToken = await mfaRequired(OWNER.email);
      const codes = await Promise.all(
        Array.from({ length: 20 }, async () => codeOf(await post('/auth/mfa/verify', { mfaToken, code: wrongCode() }))),
      );
      expect(codes.filter((c) => c === 'invalid_code')).toHaveLength(4);
      expect(codes.filter((c) => c === 'too_many_attempts')).toHaveLength(16);
    });

    it('5 codes faux : too_many_attempts (423), même avec le bon code ensuite', async () => {
      const mfaToken = await mfaRequired(OWNER.email);
      const codes: (string | undefined)[] = [];
      for (let i = 0; i < 5; i++)
        codes.push(await codeOf(await post('/auth/mfa/verify', { mfaToken, code: wrongCode() })));
      expect(codes).toEqual(['invalid_code', 'invalid_code', 'invalid_code', 'invalid_code', 'too_many_attempts']);
      await forgetUsedTotpSteps(f.app);
      const blocked = await post('/auth/mfa/verify', { mfaToken, code: totpNow(ownerSecret) });
      expect(blocked.status).toBe(423);
      expect(await codeOf(blocked)).toBe('too_many_attempts');
    });

    it('code de secours : usage unique (casse et tiret indifférents), retiré, audité', async () => {
      const code = ownerRecoveryCodes[0] ?? '';
      const ok = await post('/auth/mfa/verify', {
        mfaToken: await mfaRequired(OWNER.email),
        recoveryCode: code.toLowerCase(),
      });
      expect(ok.status).toBe(200);
      expect((await factorsOf(OWNER.id))[0]?.recovery_code_hashes).toHaveLength(9);
      const again = await post('/auth/mfa/verify', { mfaToken: await mfaRequired(OWNER.email), recoveryCode: code });
      expect(again.status).toBe(422);
      expect(await codeOf(again)).toBe('invalid_code');
      const audit = await f.h.superuser(`SELECT after FROM audit_logs WHERE action = 'user.mfa_recovery_use'`);
      expect(audit.rows).toEqual([{ after: { recoveryCodesLeft: 9 } }]);
    });

    it('jeton de second facteur falsifié, expiré, ou jeton d’accès à sa place : session_expired', async () => {
      const signer = f.app.get(AccessTokenSigner);
      const access = await signer.sign({
        sub: OWNER.id,
        space: 'platform',
        sid: '00000000-0000-7000-8000-0000000017a2',
      });
      const expired = await signer.signMfaToken(
        { sub: OWNER.id, rememberMe: false },
        new Date(Date.now() - 10 * 60_000),
      );
      for (const mfaToken of ['pas-un-jeton', access.token, expired.token]) {
        const res = await post('/auth/mfa/verify', { mfaToken, code: totpNow(ownerSecret) });
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('session_expired');
      }
    });

    it('retiré du personnel entre le mot de passe et le code : wrong_space', async () => {
      const mfaToken = await mfaRequired(OWNER.email);
      await f.h.superuser('DELETE FROM platform_staff WHERE user_id = $1', [OWNER.id]);
      try {
        await forgetUsedTotpSteps(f.app);
        const res = await post('/auth/mfa/verify', { mfaToken, code: totpNow(ownerSecret) });
        expect(res.status).toBe(401);
        expect(await codeOf(res)).toBe('wrong_space');
      } finally {
        await f.h.superuser(`INSERT INTO platform_staff (user_id, role) VALUES ($1, 'owner')`, [OWNER.id]);
      }
    });
  });

  it('utilitaire de test : platformLogin enrôle puis vérifie (connexions successives)', async () => {
    const first = await platformLogin({ app: f.app, base: f.base, identifier: SUPPORT.email, password: PASSWORD });
    expect(totpSecretOf(SUPPORT.email)).toBeDefined();
    const second = await platformLogin({ app: f.app, base: f.base, identifier: SUPPORT.email, password: PASSWORD });
    for (const s of [first, second]) {
      expect((await f.call('/platform/associations', { token: s.accessToken })).status).toBe(200);
    }
  });
});
