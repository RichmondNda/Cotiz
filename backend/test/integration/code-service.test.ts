import { Writable } from 'node:stream';
import { type DynamicModule, type INestApplicationContext, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type Config, loadConfig } from '../../src/config.js';
import { ConfigModule } from '../../src/config.module.js';
import { CodeService } from '../../src/modules/identity/application/code-service.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { CryptoModule } from '../../src/shared/crypto/index.js';
import { createLogger, LoggingModule } from '../../src/shared/logging/index.js';
import { TenantContextModule, TenantDatabase } from '../../src/shared/tenant-context/index.js';
import { type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';

/** CodeService (lot 1.1, étape 6) contre une vraie PostgreSQL : émission, essais, expiration, ré-affichage. */

describe('CodeService', () => {
  let h: IsolationHarness;
  let app: INestApplicationContext;
  let codes: CodeService;
  let logs = '';

  /** Espace auth, comme l'activation et la réinitialisation. */
  const inAuth = <T>(fn: () => Promise<T>) => app.get(TenantDatabase).withTenantContext({ space: 'auth' }, fn);
  const issue = (purpose: 'activation' | 'password_reset', userId: string = USERS.moussa, redisplayable = false) =>
    inAuth(() => codes.issue({ userId, purpose, associationId: null, issuedBy: null, redisplayable }));
  const verify = (
    code: string,
    purpose: 'activation' | 'password_reset' = 'activation',
    userId: string | null = USERS.moussa,
  ) => inAuth(() => codes.verify({ userId, purpose, code }));
  const row = async (id: string) =>
    (await h.superuser('SELECT * FROM one_time_codes WHERE id = $1', [id])).rows[0] as {
      code_hash: string;
      code_encrypted: Buffer | null;
      attempts: number;
      expires_at: Date;
      consumed_at: Date | null;
      delivery: string;
    };

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    const config: Config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      LOG_LEVEL: 'trace',
    });
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        logs += chunk.toString();
        done();
      },
    });
    @Module({})
    class CodesRoot {
      static register(): DynamicModule {
        return {
          module: CodesRoot,
          imports: [
            ConfigModule.register(config),
            LoggingModule.register(createLogger(config, { name: 'cli', destination })),
            TenantContextModule,
            CryptoModule,
          ],
          providers: [SecretHasher, CodeService],
        };
      }
    }
    app = await NestFactory.createApplicationContext(CodesRoot.register(), { logger: false });
    codes = app.get(CodeService);
  });

  afterAll(async () => {
    await app.close();
    await h.stop();
  });

  it('émet un code haché (argon2id), remis à la main, 72 h pour une activation', async () => {
    const before = Date.now();
    const issued = await issue('activation');
    expect(issued.code).toMatch(/^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    const stored = await row(issued.id);
    expect(stored.code_hash).toMatch(/^\$argon2id\$/);
    expect(stored.code_hash).not.toContain(issued.code.replace('-', ''));
    expect(stored.delivery).toBe('manual');
    expect(stored.code_encrypted).toBeNull();
    expect(stored.expires_at.getTime()).toBeGreaterThanOrEqual(before + 72 * 3_600_000 - 1_000);
    expect(issued.expiresAt.getTime()).toBe(stored.expires_at.getTime());
  });

  it('bon code (casse et tiret ignorés) : accepté, puis consommé une seule fois', async () => {
    const issued = await issue('activation');
    const check = await verify(issued.code.toLowerCase().replace('-', ' '));
    expect(check).toEqual({ ok: true, codeId: issued.id });
    expect(await inAuth(() => codes.consume(issued.id))).toBe(true);
    expect(await inAuth(() => codes.consume(issued.id))).toBe(false);
    // Consommé : le même code est reconnu (preuve), un autre non.
    // Consommé : essai non compté en base (l'appelant le compte, comme pour une personne sans code).
    expect(await verify(issued.code)).toEqual({ ok: false, problem: 'already_used', uncounted: true });
    expect(await verify(issued.code === 'ABCD-EFGH' ? 'HGFE-DCBA' : 'ABCD-EFGH')).toEqual({
      ok: false,
      problem: 'invalid_code',
      uncounted: true,
    });
  });

  it('5 essais : invalid_code puis too_many_attempts, même avec le bon code ensuite', async () => {
    const issued = await issue('password_reset');
    const wrong = issued.code === '000000' ? '111111' : '000000';
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await verify(wrong, 'password_reset'));
    expect(results.map((r) => (r.ok ? 'ok' : r.problem))).toEqual([
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'invalid_code',
      'too_many_attempts',
    ]);
    expect((await row(issued.id)).attempts).toBe(5);
    expect(await verify(issued.code, 'password_reset')).toEqual({ ok: false, problem: 'too_many_attempts' });
  });

  it('code bloqué par ses 5 essais : plus rien à ré-afficher', async () => {
    const issued = await issue('activation', USERS.aminata, true);
    await h.superuser('UPDATE one_time_codes SET attempts = 5 WHERE id = $1', [issued.id]);
    expect(await inAuth(() => codes.reveal(issued.id))).toBeNull();
  });

  it('essais simultanés : jamais plus de 5 comptés', async () => {
    const issued = await issue('password_reset', USERS.fatou);
    const wrong = issued.code === '000000' ? '111111' : '000000';
    await Promise.all(Array.from({ length: 12 }, () => verify(wrong, 'password_reset', USERS.fatou)));
    expect((await row(issued.id)).attempts).toBe(5);
  });

  it('code expiré : code_expired', async () => {
    const issued = await issue('password_reset', USERS.koffi);
    await h.superuser(`UPDATE one_time_codes SET expires_at = now() - interval '1 second' WHERE id = $1`, [issued.id]);
    expect(await verify(issued.code, 'password_reset', USERS.koffi)).toEqual({ ok: false, problem: 'code_expired' });
  });

  it('un nouveau code invalide les précédents du même usage (et seulement eux)', async () => {
    const reset = await issue('password_reset', USERS.aminata);
    const first = await issue('activation', USERS.aminata, true);
    const second = await issue('activation', USERS.aminata);
    expect(await verify(first.code, 'activation', USERS.aminata)).toEqual({ ok: false, problem: 'invalid_code' });
    const old = await row(first.id);
    expect(old.expires_at.getTime()).toBeLessThanOrEqual(Date.now());
    expect(old.code_encrypted).toBeNull();
    expect(await verify(second.code, 'activation', USERS.aminata)).toEqual({ ok: true, codeId: second.id });
    expect(await verify(reset.code, 'password_reset', USERS.aminata)).toEqual({ ok: true, codeId: reset.id });
  });

  it('personne inconnue ou sans code : invalid_code, après une vérification argon2id (même temps)', async () => {
    const hasher = app.get(SecretHasher);
    const calls: string[] = [];
    const original = hasher.verify.bind(hasher);
    hasher.verify = (hashed, secret) => {
      calls.push(hashed);
      return original(hashed, secret);
    };
    try {
      const uncounted = { ok: false, problem: 'invalid_code', uncounted: true };
      expect(await verify('K7M4-P9QX', 'activation', null)).toEqual(uncounted);
      expect(await verify('K7M4-P9QX', 'activation', USERS.awa)).toEqual(uncounted);
      expect(calls).toHaveLength(2);
      expect(calls.every((hashed) => hashed.startsWith('$argon2id$'))).toBe(true);
    } finally {
      hasher.verify = original;
    }
  });

  it('code expiré ou épuisé : argon2id vérifié quand même (le temps ne dit pas qu’un code existe)', async () => {
    const issued = await issue('password_reset', USERS.awa);
    await h.superuser(`UPDATE one_time_codes SET expires_at = now() - interval '1 second' WHERE id = $1`, [issued.id]);
    const hasher = app.get(SecretHasher);
    let calls = 0;
    const original = hasher.verify.bind(hasher);
    hasher.verify = (hashed, secret) => {
      calls++;
      return original(hashed, secret);
    };
    try {
      expect(await verify(issued.code, 'password_reset', USERS.awa)).toEqual({ ok: false, problem: 'code_expired' });
      await h.superuser('UPDATE one_time_codes SET attempts = 5 WHERE id = $1', [issued.id]);
      expect(await verify(issued.code, 'password_reset', USERS.awa)).toEqual({
        ok: false,
        problem: 'too_many_attempts',
      });
      expect(calls).toBe(2);
    } finally {
      hasher.verify = original;
    }
  });

  it('deux émissions simultanées : un seul code reste valide', async () => {
    const [a, b] = await Promise.all([issue('activation', USERS.koffi), issue('activation', USERS.koffi)]);
    const { rows } = await h.superuser(
      `SELECT count(*)::int AS live FROM one_time_codes
        WHERE user_id = $1 AND purpose = 'activation' AND consumed_at IS NULL AND expires_at > now()`,
      [USERS.koffi],
    );
    expect((rows[0] as { live: number }).live).toBe(1);
    const results = [await verify(a.code, 'activation', USERS.koffi), await verify(b.code, 'activation', USERS.koffi)];
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });

  it('activation ré-affichable : chiffrée (AES-256-GCM) jusqu’à consommation, jamais ailleurs', async () => {
    const issued = await issue('activation', USERS.koffi, true);
    const stored = await row(issued.id);
    expect(stored.code_encrypted).not.toBeNull();
    expect(stored.code_encrypted?.toString('latin1')).not.toContain(issued.code.replace('-', ''));
    expect(await inAuth(() => codes.reveal(issued.id))).toBe(issued.code);

    // Chiffré recopié sur un autre code : illisible (lié à sa ligne).
    const other = await issue('activation', USERS.fatou, true);
    await h.superuser('UPDATE one_time_codes SET code_encrypted = $1 WHERE id = $2', [stored.code_encrypted, other.id]);
    await expect(inAuth(() => codes.reveal(other.id))).rejects.toThrow();

    expect(await inAuth(() => codes.consume(issued.id))).toBe(true);
    expect((await row(issued.id)).code_encrypted).toBeNull();
    expect(await inAuth(() => codes.reveal(issued.id))).toBeNull();
  });

  it('une réinitialisation n’est jamais chiffrée, même demandée ré-affichable', async () => {
    const issued = await issue('password_reset', USERS.moussa, true);
    expect((await row(issued.id)).code_encrypted).toBeNull();
  });

  it('aucun code dans les journaux (niveau trace)', async () => {
    const issued = await issue('activation', USERS.moussa, true);
    await verify('ZZZZ-ZZZZ');
    await verify(issued.code);
    await inAuth(() => codes.reveal(issued.id));
    expect(logs).not.toContain(issued.code);
    expect(logs).not.toContain(issued.code.replace('-', ''));
  });
});
