import { Writable } from 'node:stream';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { verify } from '@node-rs/argon2';
import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CliModule } from '../../src/cli/cli.module.js';
import { runCli } from '../../src/cli/commands.js';
import { CreatePlatformOwnerUseCase } from '../../src/modules/identity/application/create-platform-owner.use-case.js';
import { type Config, loadConfig } from '../../src/config.js';
import {
  DEV_PASSWORD,
  SeedDevAccountsUseCase,
} from '../../src/modules/identity/application/seed-dev-accounts.use-case.js';
import { SecretHasher } from '../../src/modules/identity/infra/secret-hasher.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/** `pnpm --filter backend cli create-platform-owner` : owner plateforme en attente d'activation, code remis à la main. */

class Capture extends Writable {
  text = '';
  override _write(chunk: Buffer, _encoding: string, done: () => void): void {
    this.text += chunk.toString();
    done();
  }
}

describe('CLI : create-platform-owner', () => {
  let h: IsolationHarness;
  let app: INestApplicationContext;

  const run = async (...argv: string[]) => {
    const out = new Capture();
    const err = new Capture();
    const status = await runCli(app, argv, { out, err });
    return { status, out: out.text, err: err.text };
  };

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      COTIZ_DEV_SEED: '1',
    });
    app = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
  });

  /** Lignes créées par la commande pour cette adresse, toutes tables confondues. */
  const footprint = async (email: string) => {
    const { rows } = await h.superuser(
      `SELECT (SELECT count(*) FROM users WHERE email = $1)::int AS users,
              (SELECT count(*) FROM credentials c JOIN users u ON u.id = c.user_id WHERE u.email = $1)::int AS credentials,
              (SELECT count(*) FROM platform_staff p JOIN users u ON u.id = p.user_id WHERE u.email = $1)::int AS staff,
              (SELECT count(*) FROM one_time_codes o JOIN users u ON u.id = o.user_id WHERE u.email = $1)::int AS codes,
              (SELECT count(*) FROM audit_logs WHERE action = 'platform_staff.create_owner'
                                                 AND after->>'email' = $1)::int AS audit`,
      [email],
    );
    return rows[0] as Record<string, number>;
  };
  const ONE = { users: 1, credentials: 1, staff: 1, codes: 1, audit: 1 };

  afterAll(async () => {
    await app.close();
    await h.stop();
  });

  it('crée la personne, son rôle owner et un code d’activation de 72 h, haché', async () => {
    const before = Date.now();
    const { status, out } = await run('create-platform-owner', 'Owner@Cotiz.app', 'Richy', 'Nda');
    expect(status).toBe(0);

    const code = /Code d’activation : ([2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4})/.exec(out)?.[1] ?? '';
    expect(code).not.toBe('');
    // Le lien d'activation ne contient jamais le code, sous aucune forme.
    const link = out.split('\n').find((line) => line.startsWith('À saisir sur ')) ?? '';
    expect(link).toBe(
      'À saisir sur https://app.cotiz.test/activer?espace=plateforme avec l’adresse email et un nouveau mot de passe.',
    );

    const { rows: users } = await h.superuser(
      `SELECT u.id, u.email::text AS email_text, u.first_name, u.last_name, u.status, u.must_change_password, c.password_hash, p.role
         FROM users u JOIN credentials c ON c.user_id = u.id JOIN platform_staff p ON p.user_id = u.id
        WHERE u.email = 'owner@cotiz.app'`,
    );
    expect(users).toEqual([
      expect.objectContaining({
        // Mis en minuscules (comparaison sur le texte, citext ignorant la casse).
        email_text: 'owner@cotiz.app',
        first_name: 'Richy',
        last_name: 'Nda',
        status: 'pending_activation',
        must_change_password: true,
        password_hash: null,
        role: 'owner',
      }),
    ]);
    const userId = (users[0] as { id: string }).id;

    const { rows: codes } = await h.superuser(
      `SELECT purpose, delivery, code_hash, attempts, expires_at, consumed_at, association_id, code_encrypted
         FROM one_time_codes WHERE user_id = $1`,
      [userId],
    );
    expect(codes).toHaveLength(1);
    const row = codes[0] as {
      purpose: string;
      delivery: string;
      code_hash: string;
      attempts: number;
      expires_at: Date;
      consumed_at: Date | null;
      association_id: string | null;
      code_encrypted: Buffer | null;
    };
    expect(row).toMatchObject({
      purpose: 'activation',
      delivery: 'manual',
      attempts: 0,
      consumed_at: null,
      association_id: null,
      // Non ré-affichable (architecture/03-auth.md) : jamais chiffré pour la plateforme.
      code_encrypted: null,
    });
    // argon2id, paramètres OWASP (architecture/03-auth.md).
    expect(row.code_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verify(row.code_hash, code.replace('-', ''))).toBe(true);
    const ttl = row.expires_at.getTime() - before;
    expect(ttl).toBeGreaterThan(72 * 3_600_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(72 * 3_600_000 + 60_000);

    const { rows: audit } = await h.superuser(
      `SELECT action, entity_type, entity_id, association_id, after FROM audit_logs WHERE entity_id = $1`,
      [userId],
    );
    expect(audit).toEqual([
      expect.objectContaining({
        action: 'platform_staff.create_owner',
        entity_type: 'user',
        association_id: null,
      }),
    ]);
    expect((audit[0] as { after: { operator: string } }).after.operator).toMatch(/^cli:./);
    expect(JSON.stringify(audit)).not.toContain(code.replace('-', ''));
  });

  it('refuse une adresse déjà utilisée, sans rien créer', async () => {
    expect((await run('create-platform-owner', 'koffi@cotiz.app', 'Koffi', 'Yao')).status).toBe(0);
    const { status, err } = await run('create-platform-owner', 'KOFFI@cotiz.app', 'Autre', 'Personne');
    expect(status).toBe(1);
    expect(err).toBe('Cette adresse est déjà utilisée par un compte.\n');
    expect(await footprint('koffi@cotiz.app')).toEqual(ONE);
  });

  it('deux exécutions simultanées sur la même adresse : une seule réussit, l’autre est refusée proprement', async () => {
    const results = await Promise.all([
      run('create-platform-owner', 'awa@cotiz.app', 'Awa', 'Koné'),
      run('create-platform-owner', 'awa@cotiz.app', 'Awa', 'Koné'),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([0, 1]);
    expect(results.find((r) => r.status === 1)?.err).toBe('Cette adresse est déjà utilisée par un compte.\n');
    expect(await footprint('awa@cotiz.app')).toEqual(ONE);
  });

  it('erreur inattendue : sortie 1, message générique, ni email ni détail SQL sur stderr ou dans le journal', async () => {
    const leak = Object.assign(new Error('Key (email)=(fuite@cotiz.app) violates something'), { code: '23503' });
    const useCase = app.get(CreatePlatformOwnerUseCase);
    const execute = vi.spyOn(useCase, 'execute').mockRejectedValueOnce(new Error('requête échouée', { cause: leak }));
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    try {
      const { status, err, out } = await run('create-platform-owner', 'fuite@cotiz.app', 'Fuite', 'Test');
      expect(status).toBe(1);
      expect(out).toBe('');
      expect(err).toBe('Échec de la commande (détails dans le journal, sans données personnelles).\n');
      expect(logged).toHaveBeenCalledOnce();
      expect(JSON.stringify(logged.mock.calls)).not.toContain('fuite');
      expect(logged.mock.calls[0]?.[0]).toMatchObject({ sqlState: '23503' });
    } finally {
      execute.mockRestore();
      logged.mockRestore();
    }
  });

  it('la violation d’unicité de users.email (course perdue) est présentée comme une adresse déjà utilisée', async () => {
    const race = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'users_email_key' });
    const execute = vi
      .spyOn(app.get(CreatePlatformOwnerUseCase), 'execute')
      .mockRejectedValueOnce(new Error('requête échouée', { cause: race }));
    try {
      const { status, err } = await run('create-platform-owner', 'course@cotiz.app', 'Course', 'Test');
      expect({ status, err }).toEqual({ status: 1, err: 'Cette adresse est déjà utilisée par un compte.\n' });
    } finally {
      execute.mockRestore();
    }
  });

  it('une autre violation d’unicité n’est pas présentée comme une adresse déjà utilisée', async () => {
    const other = Object.assign(new Error('duplicate'), { code: '23505', constraint: 'platform_staff_pkey' });
    const execute = vi
      .spyOn(app.get(CreatePlatformOwnerUseCase), 'execute')
      .mockRejectedValueOnce(new Error('requête échouée', { cause: other }));
    const logged = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
    try {
      const { status, err } = await run('create-platform-owner', 'autre@cotiz.app', 'Autre', 'Test');
      expect(status).toBe(1);
      expect(err).not.toContain('déjà utilisée');
    } finally {
      execute.mockRestore();
      logged.mockRestore();
    }
  });

  it('refuse une adresse invalide ou des arguments manquants, en trop ou vides, avec l’aide', async () => {
    expect(await run('create-platform-owner', 'pas-une-adresse', 'A', 'B')).toEqual({
      status: 1,
      out: '',
      err: 'Adresse email invalide.\n',
    });
    const usage = 'Usage : create-platform-owner <email> <prénom> <nom>\n';
    for (const args of [['x@cotiz.app'], ['x@cotiz.app', 'A', 'B', 'C'], ['x@cotiz.app', '  ', 'B']]) {
      expect(await run('create-platform-owner', ...args)).toEqual({ status: 1, out: '', err: usage });
    }
    const unknown = await run('inconnue');
    expect(unknown.status).toBe(1);
    expect(unknown.err).toContain('create-platform-owner <email> <prénom> <nom>');
    expect(await footprint('x@cotiz.app')).toEqual({ users: 0, credentials: 0, staff: 0, codes: 0, audit: 0 });
  });

  describe('seed-dev (développement)', () => {
    /** Identifiant de Richy dans les données simulées du front (frontend/server/mocks/ids.ts). */
    const RICHY = '55d091c5-ae9c-5331-a1cf-20b860c9ad5f';

    it('crée Richy, owner plateforme actif au mot de passe connu ; une seconde exécution ne change rien', async () => {
      for (let i = 0; i < 2; i++) {
        const { status, out } = await run('seed-dev');
        expect(status).toBe(0);
        expect(out).toContain(`richy@cotiz.app / ${DEV_PASSWORD}`);
      }
      const { rows } = await h.superuser(
        `SELECT u.id, u.status, c.password_hash, p.role FROM users u
           JOIN credentials c ON c.user_id = u.id JOIN platform_staff p ON p.user_id = u.id
          WHERE u.email = 'richy@cotiz.app'`,
      );
      expect(rows).toHaveLength(1);
      const richy = rows[0] as { id: string; status: string; password_hash: string; role: string };
      expect(richy).toMatchObject({ id: RICHY, status: 'active', role: 'owner' });
      expect(await verify(richy.password_hash, DEV_PASSWORD)).toBe(true);
    });

    it('refusée hors développement et test, ou sans COTIZ_DEV_SEED=1', async () => {
      for (const config of [
        { NODE_ENV: 'production', COTIZ_DEV_SEED: true },
        { NODE_ENV: 'development', COTIZ_DEV_SEED: false },
      ]) {
        const useCase = new SeedDevAccountsUseCase(new SecretHasher(), config as Config);
        await expect(useCase.execute()).rejects.toThrow(/COTIZ_DEV_SEED/);
      }
    });

    it('ne reprend jamais un compte créé autrement (son mot de passe resterait public)', async () => {
      await h.superuser(`UPDATE users SET email = 'richy-dev@cotiz.app' WHERE email = 'richy@cotiz.app'`);
      try {
        expect((await run('create-platform-owner', 'richy@cotiz.app', 'Richy', 'Nda')).status).toBe(0);
        const { status, err } = await run('seed-dev');
        expect(status).toBe(1);
        expect(err).toContain('existe déjà');
      } finally {
        await h.superuser(`UPDATE users SET email = 'richy-autre@cotiz.app' WHERE email = 'richy@cotiz.app'`);
        await h.superuser(`UPDATE users SET email = 'richy@cotiz.app' WHERE email = 'richy-dev@cotiz.app'`);
      }
    });
  });
});
