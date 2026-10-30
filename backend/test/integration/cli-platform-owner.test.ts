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
import { SeedDevProjectsUseCase } from '../../src/modules/projects/application/seed-dev-projects.use-case.js';
import { seedDevProof } from '../../src/modules/files/application/seed-dev-proof.js';
import { SeedDevPaymentsUseCase } from '../../src/modules/ledger/application/seed-dev-payments.use-case.js';
import { mockId } from '../../src/shared/dev-seed/index.js';
import { StorageService } from '../../src/shared/storage/index.js';
import {
  DEV_PASSWORD,
  SeedDevAccountsUseCase,
} from '../../src/modules/identity/application/seed-dev-accounts.use-case.js';
import type { CodeService } from '../../src/modules/identity/application/code-service.js';
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
  /** Dépôts du stockage (MinIO absent des tests) : preuves de paiement de seed-dev, conservés d'un test à l'autre. */
  const deposits: Parameters<StorageService['putObject']>[] = [];

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
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      APP_PUBLIC_URL: 'https://app.cotiz.test',
      COTIZ_DEV_SEED: '1',
    });
    app = await NestFactory.createApplicationContext(CliModule.register(config), { logger: false });
    vi.spyOn(app.get(StorageService), 'putObject').mockImplementation((...args) => {
      deposits.push(args);
      return Promise.resolve();
    });
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

    it('crée les plans de référence (mêmes identifiants que les données simulées) ; une seconde exécution ne change rien', async () => {
      const PLANS = {
        decouverte: '565ad000-94c8-5b93-9921-423aa368ac67',
        essentiel: '5d416c96-999f-5aec-86dc-d7c963b65c12',
        pro: '1ad61d48-9b23-5d62-b8bb-8f21dfc6bdf5',
      };
      for (let i = 0; i < 2; i++) {
        const { status, out } = await run('seed-dev');
        expect(status).toBe(0);
        expect(out).toContain('Plans de référence : decouverte, essentiel, pro');
      }
      const { rows } = await h.superuser(
        `SELECT id, code, price_monthly::int AS monthly, price_yearly::int AS yearly, max_projects, max_subscribers,
                max_managers, features, is_featured, is_active, version
           FROM plans ORDER BY price_monthly`,
      );
      expect(rows).toEqual([
        {
          id: PLANS.decouverte,
          code: 'decouverte',
          monthly: 0,
          yearly: 0,
          max_projects: 1,
          max_subscribers: 20,
          max_managers: 1,
          features: [],
          is_featured: false,
          is_active: true,
          version: 1,
        },
        {
          id: PLANS.essentiel,
          code: 'essentiel',
          monthly: 10000,
          yearly: 120000,
          max_projects: 5,
          max_subscribers: 100,
          max_managers: 2,
          features: ['contracts', 'auto_reminders'],
          is_featured: true,
          is_active: true,
          version: 1,
        },
        {
          id: PLANS.pro,
          code: 'pro',
          monthly: 25000,
          yearly: 300000,
          max_projects: null,
          max_subscribers: 500,
          max_managers: 5,
          features: ['contracts', 'auto_reminders', 'imports', 'analytics'],
          is_featured: false,
          is_active: true,
          version: 1,
        },
      ]);
      // Un événement par plan créé (cache des plans publics), aucun à la seconde exécution.
      const { rows: events } = await h.superuser(
        `SELECT count(*)::int AS n FROM outbox_events WHERE event_type = 'plan.updated' AND aggregate_id = ANY($1::uuid[])`,
        [Object.values(PLANS)],
      );
      expect(events[0]).toEqual({ n: 3 });
    });

    it('crée associations, comptes, appartenances et abonnements de référence (identifiants des données simulées)', async () => {
      // frontend/server/mocks/ids.ts : uid('association', slug), uid('user', clé).
      const ASSOC = {
        entraide: '32101f37-8d23-53ec-90a8-8e6bf20fe086',
        man: 'def211c3-eb54-5284-9451-ef9307b1fe79',
        bouake: '408f664e-89e0-54bd-a732-2fa83499d0d6',
      };
      const USER = {
        awa: 'e46c9ff1-b973-58c0-a663-29c7750719af',
        moussa: 'ba6d1860-ea09-5e51-9777-5b76740a4840',
        fatou: '345ba988-a626-553e-905f-22e385ef7598',
        jean: '0db8c984-945a-5e67-bb0d-1d5fb97b050d',
        ibrahim: mockId('user', 'ibrahim-toure'),
      };
      let lastCode = '';
      for (let i = 0; i < 2; i++) {
        const { status, out } = await run('seed-dev');
        expect(status).toBe(0);
        expect(out).toContain(`awa@entraide.ci / ${DEV_PASSWORD}`);
        expect(out).toContain(`+2250544218790 / ${DEV_PASSWORD}`);
        expect(out).toContain(`+2250755667788 / ${DEV_PASSWORD}`);
        expect(out).toContain(`+2250100000001 / ${DEV_PASSWORD}`);
        expect(out).toContain('Associations de référence : entraide-yopougon, ressortissants-man, jeunesse-bouake');
        const code = /\+2250122334455 : code d’activation (\S+)/.exec(out)?.[1];
        expect(code).toBeDefined();
        expect(code).not.toBe(lastCode);
        lastCode = code ?? '';
      }

      const { rows: assocs } = await h.superuser(
        `SELECT a.id, a.slug, a.status, s.status AS subscription, p.code AS plan, s.manager_seats_override AS seats
           FROM associations a
           LEFT JOIN subscriptions s ON s.association_id = a.id
           LEFT JOIN plans p ON p.id = s.plan_id
          WHERE a.id = ANY($1::uuid[]) ORDER BY a.created_at`,
        [Object.values(ASSOC)],
      );
      expect(assocs).toEqual([
        {
          id: ASSOC.entraide,
          slug: 'entraide-yopougon',
          status: 'active',
          subscription: 'active',
          plan: 'essentiel',
          seats: 3,
        },
        {
          id: ASSOC.man,
          slug: 'ressortissants-man',
          status: 'past_due',
          subscription: 'past_due',
          plan: 'pro',
          seats: null,
        },
        {
          id: ASSOC.bouake,
          slug: 'jeunesse-bouake',
          status: 'onboarding',
          subscription: 'trialing',
          plan: 'decouverte',
          seats: null,
        },
      ]);
      const { rows: methods } = await h.superuser(
        `SELECT kind, label FROM association_payment_methods WHERE association_id = $1 ORDER BY position`,
        [ASSOC.entraide],
      );
      expect(methods).toEqual([
        { kind: 'mobile_money', label: 'Orange Money' },
        { kind: 'bank_transfer', label: 'SGBCI' },
      ]);

      const { rows: people } = await h.superuser(
        `SELECT u.id, u.status, u.email, u.phone_e164 AS phone, c.password_hash
           FROM users u LEFT JOIN credentials c ON c.user_id = u.id
          WHERE u.id = ANY($1::uuid[])`,
        [Object.values(USER)],
      );
      const person = (id: string) =>
        people.find((p) => (p as { id: string }).id === id) as Record<string, string | null>;
      expect(person(USER.awa)).toMatchObject({ status: 'active', email: 'awa@entraide.ci', phone: '+2250708091011' });
      expect(person(USER.moussa)).toMatchObject({ status: 'active', phone: '+2250544218790' });
      expect(person(USER.jean)).toMatchObject({ status: 'active', phone: '+2250755667788' });
      expect(person(USER.fatou)).toMatchObject({ status: 'pending_activation', phone: '+2250122334455' });
      expect(person(USER.ibrahim)).toMatchObject({ status: 'active', phone: '+2250100000001' });
      for (const key of ['awa', 'moussa', 'jean', 'ibrahim'] as const) {
        expect(await verify(person(USER[key]).password_hash ?? '', DEV_PASSWORD)).toBe(true);
      }
      // Un seul code d'activation de la plateforme valable pour Fatou : celui de la dernière exécution (celui de son
      // association, émis ensuite par les inscriptions de référence, est vérifié plus bas).
      const { rows: codes } = await h.superuser(
        `SELECT count(*)::int AS n FROM one_time_codes
          WHERE user_id = $1 AND purpose = 'activation' AND consumed_at IS NULL AND expires_at > now()
            AND association_id IS NULL`,
        [USER.fatou],
      );
      expect(codes[0]).toEqual({ n: 1 });

      const { rows: links } = await h.superuser(
        `SELECT association_id AS aid, user_id AS uid, role, status FROM memberships
          WHERE user_id = ANY($1::uuid[]) ORDER BY association_id, user_id, role`,
        [Object.values(USER)],
      );
      const expected = [
        { aid: ASSOC.entraide, uid: USER.awa, role: 'owner', status: 'active' },
        { aid: ASSOC.entraide, uid: USER.awa, role: 'subscriber', status: 'active' },
        { aid: ASSOC.entraide, uid: USER.moussa, role: 'subscriber', status: 'active' },
        { aid: ASSOC.entraide, uid: USER.fatou, role: 'subscriber', status: 'active' },
        { aid: ASSOC.entraide, uid: USER.jean, role: 'subscriber', status: 'active' },
        { aid: ASSOC.entraide, uid: USER.ibrahim, role: 'subscriber', status: 'active' },
        { aid: ASSOC.man, uid: USER.moussa, role: 'subscriber', status: 'active' },
      ];
      expect(links).toEqual(expect.arrayContaining(expected));
      expect(links).toHaveLength(expected.length);

      // Demandes de création de référence : une seule ligne chacune malgré deux exécutions, références de la séquence.
      const { rows: requests } = await h.superuser(
        `SELECT id, reference, status, association_id AS aid, decided_by AS decider, viewed_by AS viewer
           FROM association_requests ORDER BY created_at`,
      );
      expect(requests).toHaveLength(8);
      const request = (key: string): unknown =>
        requests.find((r) => (r as { id: string }).id === mockId('request', key));
      expect(request('tontine-commercantes-adjame')).toMatchObject({
        status: 'pending',
        aid: null,
        decider: null,
        viewer: RICHY,
      });
      expect(request('entraide-yopougon')).toMatchObject({ status: 'approved', aid: ASSOC.entraide, decider: RICHY });
      expect(request('amis-grand-bassam')).toMatchObject({ status: 'rejected', aid: null, decider: RICHY });
      for (const r of requests) expect((r as { reference: string }).reference).toMatch(/^DEM-\d{4}-\d{5}$/);
      expect(new Set(requests.map((r) => (r as { reference: string }).reference)).size).toBe(8);
    });

    it('crée les projets de référence (identifiants des données simulées), sans rien changer à la seconde exécution', async () => {
      // frontend/server/mocks/ids.ts : uid('project', clé), uid('payment-method', clé).
      const PROJECT = {
        centre: 'ad6c0481-1f65-5323-baa5-f52c024d01bd',
        tontine: 'f44851a6-58ac-5125-81ea-9f3df5571d0a',
        voyage: '8f487e6e-57d0-5f55-860c-258c95db4359',
        mutuelle: '27dbfc83-378c-52d7-a8ce-a2f49100d86a',
      };
      for (let i = 0; i < 2; i++) {
        const { status, out } = await run('seed-dev');
        expect(status).toBe(0);
        expect(out).toContain(
          'Projets de référence : centre-communautaire, tontine-2027, voyage-solidaire, mutuelle-sante',
        );
      }
      const { rows } = await h.superuser(
        `SELECT p.id, p.association_id AS aid, p.status, p.schedule_type AS type, p.entry_fee_amount::text AS fee,
                p.installment_amount::text AS amount, p.start_date::text AS start, p.end_date::text AS end,
                p.required_subscribers AS required, p.financial_terms_locked_at IS NOT NULL AS locked, p.version,
                (SELECT array_agg(m.payment_method_id ORDER BY m.payment_method_id) FROM project_payment_methods m
                  WHERE m.project_id = p.id) AS methods
           FROM projects p WHERE p.id = ANY($1::uuid[]) ORDER BY p.created_at`,
        [Object.values(PROJECT)],
      );
      const entraide = mockId('association', 'entraide-yopougon');
      const both = [mockId('payment-method', 'entraide-0'), mockId('payment-method', 'entraide-1')].sort();
      expect(rows).toEqual([
        {
          id: PROJECT.centre,
          aid: entraide,
          status: 'active',
          type: 'fixed',
          fee: '50000',
          amount: '25000',
          start: '2026-03-01',
          end: '2027-08-31',
          required: 60,
          locked: true,
          version: 1,
          methods: both,
        },
        {
          id: PROJECT.voyage,
          aid: entraide,
          status: 'active',
          type: 'fixed',
          fee: '50000',
          amount: '10000',
          start: '2026-06-01',
          end: '2027-05-31',
          required: null,
          locked: true,
          version: 1,
          methods: both,
        },
        {
          id: PROJECT.mutuelle,
          aid: mockId('association', 'ressortissants-man'),
          status: 'active',
          type: 'fixed',
          fee: '20000',
          amount: '10000',
          start: '2026-07-01',
          end: '2027-04-30',
          required: null,
          locked: true,
          version: 1,
          methods: null,
        },
        {
          id: PROJECT.tontine,
          aid: entraide,
          status: 'enrolling',
          type: 'rolling',
          fee: null,
          amount: '10000',
          start: '2027-01-01',
          end: null,
          required: 30,
          locked: false,
          version: 1,
          methods: [mockId('payment-method', 'entraide-0')],
        },
      ]);

      // Conditions communes (mensuel, le 5, 5 jours de grâce, XOF), dates de verrouillage, créateur, consignes propres.
      const { rows: terms } = await h.superuser(
        `SELECT id, frequency, due_day AS day, grace_days AS grace, currency, created_by AS creator,
                (financial_terms_locked_at AT TIME ZONE 'UTC')::date::text AS locked_on
           FROM projects WHERE id = ANY($1::uuid[]) ORDER BY created_at`,
        [Object.values(PROJECT)],
      );
      const common = { frequency: 'monthly', day: 5, grace: 5, currency: 'XOF' };
      const awa = mockId('user', 'awa-kone');
      expect(terms).toEqual([
        { id: PROJECT.centre, ...common, creator: awa, locked_on: '2026-03-06' },
        { id: PROJECT.voyage, ...common, creator: awa, locked_on: '2026-06-06' },
        { id: PROJECT.mutuelle, ...common, creator: RICHY, locked_on: '2026-07-06' },
        { id: PROJECT.tontine, ...common, creator: awa, locked_on: null },
      ]);
      const { rows: overrides } = await h.superuser(
        `SELECT project_id AS pid, instructions_override AS text FROM project_payment_methods
          WHERE project_id = ANY($1::uuid[]) ORDER BY project_id, payment_method_id`,
        [[PROJECT.centre, PROJECT.voyage]],
      );
      const CENTRE = 'Indiquez votre nom et « Centre » en référence du virement.';
      expect(overrides).toEqual(
        [
          { pid: PROJECT.centre, text: CENTRE },
          { pid: PROJECT.centre, text: CENTRE },
          { pid: PROJECT.voyage, text: null },
          { pid: PROJECT.voyage, text: null },
        ].sort((x, y) => x.pid.localeCompare(y.pid)),
      );

      // Projet déjà présent dont un moyen a été retiré (pr.patch) : une nouvelle exécution ne le remet pas.
      const sgbciOfCentre = [PROJECT.centre, mockId('payment-method', 'entraide-1')];
      await h.superuser(
        'DELETE FROM project_payment_methods WHERE project_id = $1 AND payment_method_id = $2',
        sgbciOfCentre,
      );
      expect((await run('seed-dev')).status).toBe(0);
      const { rows: kept } = await h.superuser(
        'SELECT payment_method_id AS pm FROM project_payment_methods WHERE project_id = $1',
        [PROJECT.centre],
      );
      expect(kept).toEqual([{ pm: mockId('payment-method', 'entraide-0') }]);

      // Base de développement dont un moyen de référence a été désactivé (as.pm) : seuls les moyens actifs sont repris.
      const sgbci = mockId('payment-method', 'entraide-1');
      await h.superuser('DELETE FROM project_payment_methods WHERE project_id = ANY($1::uuid[])', [
        Object.values(PROJECT),
      ]);
      // Paiements (lot 2.4) puis inscriptions de référence (lot 2.3) d'abord : ils pointent vers les projets.
      await h.superuser(
        'DELETE FROM allocations WHERE payment_id IN (SELECT id FROM payments WHERE project_id = ANY($1::uuid[]))',
        [Object.values(PROJECT)],
      );
      await h.superuser('DELETE FROM payments WHERE project_id = ANY($1::uuid[])', [Object.values(PROJECT)]);
      await h.superuser('DELETE FROM installments WHERE project_id = ANY($1::uuid[])', [Object.values(PROJECT)]);
      await h.superuser('DELETE FROM enrollments WHERE project_id = ANY($1::uuid[])', [Object.values(PROJECT)]);
      await h.superuser('DELETE FROM projects WHERE id = ANY($1::uuid[])', [Object.values(PROJECT)]);
      await h.superuser('UPDATE association_payment_methods SET is_active = false WHERE id = $1', [sgbci]);
      try {
        expect((await run('seed-dev')).status).toBe(0);
        const { rows: linked } = await h.superuser(
          `SELECT project_id AS pid, payment_method_id AS pm FROM project_payment_methods
            WHERE project_id = ANY($1::uuid[]) ORDER BY project_id`,
          [[PROJECT.centre, PROJECT.voyage]],
        );
        expect(linked).toEqual(
          [PROJECT.centre, PROJECT.voyage].sort().map((pid) => ({ pid, pm: mockId('payment-method', 'entraide-0') })),
        );
      } finally {
        await h.superuser('UPDATE association_payment_methods SET is_active = true WHERE id = $1', [sgbci]);
      }
    });

    it('crée les inscriptions de référence (identifiants des données simulées) et le code de Fatou, sans doublon', async () => {
      const first = await run('seed-dev');
      expect(first.status).toBe(0);
      expect(first.out).toContain(
        'Inscriptions de référence : centre-communautaire:moussa-diarra, centre-communautaire:jean-kouassi, ' +
          'centre-communautaire:fatou-traore, centre-communautaire:awa-kone, voyage-solidaire:moussa-diarra, ' +
          'voyage-solidaire:ibrahim-toure, mutuelle-sante:moussa-diarra',
      );
      expect(first.out).toMatch(
        /Codes à remettre :\n {2}Fatou Traoré, \+2250122334455 : code d’activation [A-Z0-9]{4}-[A-Z0-9]{4}/,
      );
      expect((await run('seed-dev')).status).toBe(0);
      const { rows } = await h.superuser(
        `SELECT e.id, e.status, e.starts_from::text AS starts, count(i.id)::int AS lines,
                min(i.due_date)::text AS first, sum(i.amount_paid)::int AS paid
           FROM enrollments e JOIN installments i ON i.enrollment_id = e.id
          GROUP BY e.id ORDER BY e.id`,
      );
      const id = (key: string) => mockId('enrollment', key);
      const byId = new Map(rows.map((r) => [(r as { id: string }).id, r]));
      expect(rows).toHaveLength(7);
      // Fonds d'entrée + 18 échéances de mars 2026 à août 2027 ; versé : paiements de référence (lot 2.4).
      const paid = { 'moussa-diarra': 175000, 'jean-kouassi': 212500, 'awa-kone': 200000 };
      for (const key of ['moussa-diarra', 'jean-kouassi', 'awa-kone'] as const) {
        expect(byId.get(id(`centre-communautaire:${key}`))).toEqual({
          id: id(`centre-communautaire:${key}`),
          status: 'active',
          starts: '2026-03-01',
          lines: 19,
          first: '2026-03-05',
          paid: paid[key],
        });
      }
      // Entrée le 2 septembre : fonds d'entrée + échéances de septembre 2026 à août 2027.
      expect(byId.get(id('centre-communautaire:fatou-traore'))).toMatchObject({ starts: '2026-09-02', lines: 13 });
      expect(byId.get(id('voyage-solidaire:moussa-diarra'))).toMatchObject({ starts: '2026-09-18' });
      expect(byId.get(id('voyage-solidaire:ibrahim-toure'))).toMatchObject({ starts: '2026-09-15', paid: 0 });
      expect(byId.get(id('mutuelle-sante:moussa-diarra'))).toMatchObject({ starts: '2026-07-01', status: 'active' });
      const { rows: codes } = await h.superuser(
        `SELECT count(*)::int AS n FROM one_time_codes
          WHERE user_id = $1 AND purpose = 'activation' AND association_id = $2 AND consumed_at IS NULL`,
        [mockId('user', 'fatou-traore'), mockId('association', 'entraide-yopougon')],
      );
      expect((codes[0] as { n: number }).n).toBeGreaterThan(0);
      const { rows: profiles } = await h.superuser(
        'SELECT user_id, created_by_association_id AS creator FROM subscriber_profiles ORDER BY user_id',
      );
      expect(profiles).toContainEqual({
        user_id: mockId('user', 'fatou-traore'),
        creator: mockId('association', 'entraide-yopougon'),
      });
      expect(profiles).toContainEqual({ user_id: mockId('user', 'moussa-diarra'), creator: null });
    });

    it('crée les paiements de référence : soldes des échéances = répartitions, preuves déposées, sans doublon', async () => {
      const ENTRAIDE = mockId('association', 'entraide-yopougon');
      const MAN = mockId('association', 'ressortissants-man');
      const AMINATA = mockId('user', 'aminata-konate');
      const RESPONSABLE = mockId('user', 'responsable-man');
      const first = await run('seed-dev');
      expect(first.status).toBe(0);
      expect(first.out).toContain('Paiements de référence : 3 en attente, 20 validés');
      const depositsBefore = deposits.length;
      const second = await run('seed-dev');
      expect(second.out).toContain('Paiements de référence : 3 en attente, 20 validés');
      // Seconde exécution : aucun paiement, aucune répartition, aucun dépôt de plus.
      expect(deposits.length).toBe(depositsBefore);
      const { rows: counts } = await h.superuser(
        `SELECT (SELECT count(*) FROM payments)::int AS payments, (SELECT count(*) FROM allocations)::int AS allocations`,
      );
      expect(counts[0]).toEqual({ payments: 23, allocations: 30 });

      // Paiements des données simulées (uid('payment', clé)) pour les inscrits réels, plus l'historique de Jean et
      // d'Awa (fonds d'entrée à juillet), découpé comme celui de Moussa.
      const { rows: payments } = await h.superuser(
        `SELECT id, association_id AS aid, enrollment_id AS eid, amount_declared::int AS amount, status,
                reviewed_by AS reviewer, payment_method_id AS method, proof_file_id AS proof,
                transaction_reference AS ref, paid_on::text AS paid_on
           FROM payments ORDER BY declared_at`,
      );
      const payment = (key: string): unknown =>
        payments.find((p) => (p as { id: string }).id === mockId('payment', key));
      expect(payment('pm-awa-kone')).toEqual({
        id: mockId('payment', 'pm-awa-kone'),
        aid: ENTRAIDE,
        eid: mockId('enrollment', 'centre-communautaire:awa-kone'),
        amount: 75000,
        status: 'pending',
        reviewer: null,
        method: mockId('payment-method', 'entraide-0'),
        proof: mockId('file', 'pm-awa-kone'),
        ref: null,
        paid_on: '2026-09-22',
      });
      expect(payment('pm-jean-kouassi')).toMatchObject({ status: 'pending', proof: null, ref: '[RÉFÉRENCE]' });
      expect(payment('pm-ibrahim-toure')).toMatchObject({
        status: 'pending',
        proof: mockId('file', 'pm-ibrahim-toure'),
      });
      expect(payment('pm-jk-09')).toMatchObject({ amount: 37500, status: 'validated', reviewer: AMINATA });
      expect(payment('pm-ak-03-c')).toMatchObject({ amount: 75000, status: 'validated', reviewer: AMINATA });
      expect(payment('pm-md-07-m')).toMatchObject({ aid: MAN, amount: 30000, reviewer: RESPONSABLE, method: null });
      // Personnes du jeu de référence absentes en réel (Koffi, Kadiatou…) : aucun paiement.
      expect(payment('pm-kadiatou-sanogo')).toBeUndefined();

      // Invariant du registre : montant payé = Σ répartitions confirmées, en attente = Σ répartitions proposées.
      const { rows: drift } = await h.superuser(
        `SELECT i.id FROM installments i
           LEFT JOIN LATERAL (
             SELECT coalesce(sum(a.amount) FILTER (WHERE a.state = 'confirmed'), 0) AS paid,
                    coalesce(sum(a.amount) FILTER (WHERE a.state = 'proposed'), 0) AS pending
               FROM allocations a WHERE a.installment_id = i.id) s ON true
          WHERE i.amount_paid <> s.paid OR i.amount_pending <> s.pending
             OR (i.amount_paid = i.amount_due) <> (i.status = 'paid' AND i.paid_at IS NOT NULL)
             OR (i.status <> 'paid' AND i.paid_at IS NOT NULL)
             OR (i.status = 'late') <> (i.late_since IS NOT NULL)
             OR (i.amount_paid < i.amount_due AND i.amount_pending > 0 AND i.status <> 'declared')`,
      );
      expect(drift).toEqual([]);
      // Situations de docs/specs/seed-reference.yaml (versé, déclaré) par inscription.
      const { rows: totals } = await h.superuser(
        `SELECT enrollment_id AS eid, sum(amount_paid)::int AS paid, sum(amount_pending)::int AS pending
           FROM installments GROUP BY enrollment_id`,
      );
      const total = (key: string): unknown =>
        totals.find((t) => (t as { eid: string }).eid === mockId('enrollment', key));
      expect(total('centre-communautaire:moussa-diarra')).toMatchObject({ paid: 175000, pending: 0 });
      expect(total('centre-communautaire:jean-kouassi')).toMatchObject({ paid: 212500, pending: 12500 });
      expect(total('centre-communautaire:awa-kone')).toMatchObject({ paid: 200000, pending: 75000 });
      expect(total('voyage-solidaire:ibrahim-toure')).toMatchObject({ paid: 0, pending: 10000 });
      expect(total('mutuelle-sante:moussa-diarra')).toMatchObject({ paid: 50000, pending: 0 });
      expect(total('centre-communautaire:fatou-traore')).toMatchObject({ paid: 0, pending: 0 });
      // Août de Jean payé à moitié, solde déclaré : « déclarée » ; ses échéances soldées sont payées à la validation.
      const { rows: august } = await h.superuser(
        `SELECT status, amount_paid::int AS paid, amount_pending::int AS pending FROM installments WHERE id = $1`,
        [mockId('installment', 'centre-communautaire:jean-kouassi:6')],
      );
      expect(august[0]).toEqual({ status: 'declared', paid: 12500, pending: 12500 });
      const { rows: entry } = await h.superuser(`SELECT status, paid_at FROM installments WHERE id = $1`, [
        mockId('installment', 'centre-communautaire:awa-kone:0'),
      ]);
      expect(entry[0]).toEqual({ status: 'paid', paid_at: new Date('2026-03-06T09:00:00Z') });

      // Preuves : fichiers analysés de l'association, déposés dans le compartiment des preuves (JPEG généré).
      const { rows: proofs } = await h.superuser(
        `SELECT id, association_id AS aid, owner_user_id AS owner, purpose, bucket, object_key AS key,
                original_name AS name, mime_type AS mime, scan_status AS scan, sha256 IS NOT NULL AS hashed
           FROM files WHERE id = ANY($1::uuid[]) ORDER BY original_name`,
        [[mockId('file', 'pm-awa-kone'), mockId('file', 'pm-ibrahim-toure')]],
      );
      expect(proofs).toEqual([
        {
          id: mockId('file', 'pm-ibrahim-toure'),
          aid: ENTRAIDE,
          owner: mockId('user', 'ibrahim-toure'),
          purpose: 'payment_proof',
          bucket: 'cotiz-proofs',
          key: `${ENTRAIDE}/payment_proof/${mockId('file', 'pm-ibrahim-toure')}.jpg`,
          name: '[FICHIER]',
          mime: 'image/jpeg',
          scan: 'clean',
          hashed: true,
        },
        expect.objectContaining({ id: mockId('file', 'pm-awa-kone'), name: 'capture_mobile_money.jpg', scan: 'clean' }),
      ]);
      const stored = deposits.find(([, key]) => key === (proofs[1] as { key: string }).key);
      expect(stored?.[0]).toBe('cotiz-proofs');
      expect(stored?.[3]).toBe('image/jpeg');
      expect(stored?.[2].subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));

      // Relecteurs du jeu de référence : sans connexion possible (désactivés, sans mot de passe).
      const { rows: reviewers } = await h.superuser(
        `SELECT u.id, u.status, u.first_name AS first, u.last_name AS last,
                (SELECT count(*) FROM credentials c WHERE c.user_id = u.id)::int AS credentials,
                (SELECT array_agg(m.role || ':' || m.status) FROM memberships m WHERE m.user_id = u.id) AS links
           FROM users u WHERE u.id = ANY($1::uuid[]) ORDER BY u.first_name COLLATE "C"`,
        [[AMINATA, RESPONSABLE]],
      );
      expect(reviewers).toEqual([
        {
          id: AMINATA,
          status: 'disabled',
          first: 'Aminata',
          last: 'Konaté',
          credentials: 0,
          links: ['manager:removed'],
        },
        {
          id: RESPONSABLE,
          status: 'disabled',
          first: '[Responsable]',
          last: '',
          credentials: 0,
          links: ['owner:active'],
        },
      ]);
      expect(first.out).not.toContain('aminata');
    });

    it('refusée hors développement et test, ou sans COTIZ_DEV_SEED=1', async () => {
      for (const config of [
        { NODE_ENV: 'production', COTIZ_DEV_SEED: true },
        { NODE_ENV: 'development', COTIZ_DEV_SEED: false },
      ]) {
        const useCase = new SeedDevAccountsUseCase(new SecretHasher(), {} as CodeService, config as Config);
        await expect(useCase.execute()).rejects.toThrow(/COTIZ_DEV_SEED/);
        await expect(new SeedDevProjectsUseCase(config as Config).execute('entraide-yopougon')).rejects.toThrow(
          /COTIZ_DEV_SEED/,
        );
        // Paiements validés et preuves sans analyse antivirus (lot 2.4) : refusés avant tout accès base ou stockage.
        await expect(
          new SeedDevPaymentsUseCase({} as StorageService, config as Config).execute('entraide-yopougon'),
        ).rejects.toThrow(/COTIZ_DEV_SEED/);
        await expect(
          seedDevProof({} as StorageService, config as Config, {
            id: mockId('file', 'pm-awa-kone'),
            associationId: mockId('association', 'entraide-yopougon'),
            ownerUserId: mockId('user', 'awa-kone'),
            originalName: 'capture_mobile_money.jpg',
          }),
        ).rejects.toThrow(/COTIZ_DEV_SEED/);
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
