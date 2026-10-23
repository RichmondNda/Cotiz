import type { INestApplication } from '@nestjs/common';
import { AltchaChallenge, AssociationRequestCreated } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { type Config, loadConfig } from '../../src/config.js';
import { SUBMISSIONS_PER_HOUR } from '../../src/modules/onboarding/http/submit-throttle.interceptor.js';
import { AltchaService } from '../../src/modules/onboarding/infra/altcha.service.js';
import { type IsolationHarness, startIsolationHarness } from '../isolation/harness.js';

/**
 * Lot 1.3 · étape 2 : formulaire public de demande (pub.challenge, pub.request) à travers les vraies gardes, un vrai
 * Redis (anti-rejeu du défi, limitation par IP) et la base migrée (dépôt en espace public sans relecture).
 * Vérification de l'étape : un envoi sans défi ALTCHA valide → challenge_failed.
 */

const PLANS = {
  essentiel: '00000000-0000-7000-8000-0000000d0001',
  archive: '00000000-0000-7000-8000-0000000d0002',
  inactif: '00000000-0000-7000-8000-0000000d0003',
} as const;

const demande = (altcha: string, overrides: Record<string, unknown> = {}) => ({
  association: {
    name: 'Entraide Yopougon',
    type: 'association',
    city: 'Abidjan',
    country: 'CI',
    registrationNumber: 'CI-ABJ-2024-B-1234',
    activityDescription: 'Entraide entre familles du quartier de Yopougon.',
  },
  contact: {
    firstName: 'Awa',
    lastName: 'Koné',
    title: 'Présidente',
    email: 'awa@entraide.ci',
    phone: '+2250708091011',
  },
  needs: {
    estimatedSubscribers: '51_200',
    plannedProjects: 2,
    desiredPlanId: PLANS.essentiel,
    acquisitionSource: 'Bouche à oreille',
  },
  termsAccepted: true,
  website: '',
  altcha,
  ...overrides,
});

const encode = (payload: unknown) => Buffer.from(JSON.stringify(payload)).toString('base64');

describe('formulaire public de demande (pub.challenge, pub.request)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;
  let config: Config;

  const call = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    fetch(`${base}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code;

  const challenge = async () => {
    const res = await call('GET', '/public/altcha-challenge');
    expect(res.status).toBe(200);
    return AltchaChallenge.parse(await res.json());
  };
  /** Ce que fait le widget du formulaire : résoudre le défi et renvoyer `{ challenge, solution }` en base64. */
  const solve = async (c?: AltchaChallenge) => {
    const issued = c ?? (await challenge());
    const solution = await solveChallenge({ challenge: issued, deriveKey });
    if (!solution) throw new Error('défi non résolu');
    return encode({ challenge: issued, solution });
  };
  const submit = async (body: unknown, key: string = crypto.randomUUID()) =>
    call('POST', '/public/association-requests', body, { 'idempotency-key': key });

  const rows = async () =>
    (await h.superuser('SELECT * FROM association_requests ORDER BY reference')).rows as Record<string, unknown>[];
  const events = async () =>
    (
      await h.superuser(
        `SELECT association_id, aggregate_type, aggregate_id, payload FROM outbox_events
          WHERE event_type = 'association.request_submitted' ORDER BY id`,
      )
    ).rows as { association_id: string | null; aggregate_type: string; aggregate_id: string; payload: unknown }[];

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await h.superuser(
      `INSERT INTO plans (id, code, name, price_monthly, price_yearly, features, is_active, archived_at)
       VALUES ($1, 'essentiel', 'Essentiel', 10000, 120000, '{}', true, NULL),
              ($2, 'ancien', 'Ancien', 5000, 50000, '{}', false, now()),
              ($3, 'retire', 'Retiré', 5000, 50000, '{}', false, NULL)`,
      [PLANS.essentiel, PLANS.archive, PLANS.inactif],
    );
    config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      PLATFORM_DATABASE_URL: h.db.urlFor('cotiz_platform'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '10000',
      RATE_LIMIT_IP_PER_MIN: '10000',
      // Preuve de travail légère : le test résout chaque défi en quelques millisecondes.
      ALTCHA_COST: '1',
    });
    app = await createApp(config, { logger: false });
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  beforeEach(async () => {
    await redis.exec(['redis-cli', 'FLUSHALL']);
    await h.superuser(`DELETE FROM outbox_events WHERE event_type = 'association.request_submitted'`);
    await h.superuser('ALTER TABLE association_requests DISABLE TRIGGER ALL');
    await h.superuser('DELETE FROM association_requests');
    await h.superuser('ALTER TABLE association_requests ENABLE TRIGGER ALL');
  });

  describe('pub.challenge', () => {
    it('défi signé, PBKDF2, valable 10 minutes', async () => {
      const before = Math.floor(Date.now() / 1000);
      const c = await challenge();
      const after = Math.ceil(Date.now() / 1000);
      expect(c.parameters.algorithm).toBe('PBKDF2/SHA-256');
      expect(c.signature).not.toBe('');
      expect(c.parameters.expiresAt).toBeGreaterThanOrEqual(before + 600);
      expect(c.parameters.expiresAt).toBeLessThanOrEqual(after + 600);
    });

    it('deux défis ne se ressemblent pas', async () => {
      const [a, b] = await Promise.all([challenge(), challenge()]);
      expect(a.parameters.nonce).not.toBe(b.parameters.nonce);
    });
  });

  describe('pub.request : dépôt', () => {
    it('201 : référence DEM-<année>-<numéro>, demande en attente enregistrée telle que saisie', async () => {
      const res = await submit(demande(await solve()));
      expect(res.status).toBe(201);
      const body = AssociationRequestCreated.parse(await res.json());
      expect(body.reference).toMatch(new RegExp(`^DEM-${String(new Date().getUTCFullYear())}-\\d{5}$`));
      expect(body.contactEmail).toBe('awa@entraide.ci');

      const [row] = await rows();
      expect(row).toMatchObject({
        id: body.id,
        reference: body.reference,
        association_name: 'Entraide Yopougon',
        association_type: 'association',
        city: 'Abidjan',
        country: 'CI',
        registration_number: 'CI-ABJ-2024-B-1234',
        activity_description: 'Entraide entre familles du quartier de Yopougon.',
        contact_first_name: 'Awa',
        contact_last_name: 'Koné',
        contact_title: 'Présidente',
        contact_email: 'awa@entraide.ci',
        contact_phone: '+2250708091011',
        estimated_subscribers: '51_200',
        planned_projects: 2,
        desired_plan_id: PLANS.essentiel,
        acquisition_source: 'Bouche à oreille',
        status: 'pending',
        viewed_by: null,
        decided_by: null,
        association_id: null,
        internal_note: null,
      });
      expect(row?.terms_accepted_at).toBeInstanceOf(Date);
    });

    it('événement association.request_submitted (plateforme, sans association, sans donnée de contact)', async () => {
      const body = AssociationRequestCreated.parse(await (await submit(demande(await solve()))).json());
      expect(await events()).toEqual([
        {
          association_id: null,
          aggregate_type: 'association_request',
          aggregate_id: body.id,
          payload: { requestId: body.id, reference: body.reference, associationName: 'Entraide Yopougon' },
        },
      ]);
    });

    it('deux demandes : deux références qui se suivent', async () => {
      const first = AssociationRequestCreated.parse(await (await submit(demande(await solve()))).json());
      const second = AssociationRequestCreated.parse(await (await submit(demande(await solve()))).json());
      const number = (reference: string) => Number(reference.slice(-5));
      expect(number(second.reference)).toBe(number(first.reference) + 1);
    });

    it('même Idempotency-Key : même réponse, une seule demande, le rejeu ne compte pas dans la limite', async () => {
      const key = crypto.randomUUID();
      const body = demande(await solve());
      const first = await submit(body, key);
      const firstBody: unknown = await first.json();
      for (let i = 0; i < SUBMISSIONS_PER_HOUR + 1; i++) {
        const replay = await submit(body, key);
        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual(firstBody);
      }
      expect(await rows()).toHaveLength(1);
      // Le compteur horaire n'a vu que le premier envoi : une autre demande passe encore.
      expect((await submit(demande(await solve()))).status).toBe(201);
    });

    it('sans Idempotency-Key : 422 validation_failed', async () => {
      const res = await call('POST', '/public/association-requests', demande(await solve()));
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('validation_failed');
    });

    it('plan souhaité inconnu, archivé ou inactif : 422 validation_failed sur le champ, rien d’enregistré', async () => {
      for (const desiredPlanId of [crypto.randomUUID(), PLANS.archive, PLANS.inactif]) {
        const body = demande(await solve(), {
          needs: { estimatedSubscribers: '1_20', desiredPlanId },
        });
        const res = await submit(body);
        expect(res.status).toBe(422);
        const problem = (await res.json()) as { code: string; fields?: Record<string, string> };
        expect(problem.code).toBe('validation_failed');
        expect(Object.keys(problem.fields ?? {})).toEqual(['needs.desiredPlanId']);
      }
      expect(await rows()).toEqual([]);
    });

    it('CGU non acceptées ou description trop longue : 422 validation_failed', async () => {
      const altcha = await solve();
      for (const body of [
        demande(altcha, { termsAccepted: false }),
        demande(altcha, {
          association: { ...demande(altcha).association, activityDescription: 'x'.repeat(501) },
        }),
      ]) {
        const res = await submit(body);
        expect(res.status).toBe(422);
        expect(await codeOf(res)).toBe('validation_failed');
      }
      expect(await rows()).toEqual([]);
    });
  });

  describe('anti-robots sans service tiers (décision n° 12)', () => {
    const refused = async (altcha: string) => {
      const res = await submit(demande(altcha));
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('challenge_failed');
    };

    it('défi ALTCHA illisible : 422 challenge_failed, rien d’enregistré', async () => {
      await refused('pas-du-base64');
      await refused(encode({ hello: 'world' }));
      expect(await rows()).toEqual([]);
      expect(await events()).toEqual([]);
    });

    it('solution fausse : 422 challenge_failed', async () => {
      const c = await challenge();
      await refused(encode({ challenge: c, solution: { counter: 1, derivedKey: '00'.repeat(32) } }));
    });

    it('défi altéré (paramètres changés après signature) : 422 challenge_failed', async () => {
      const c = await challenge();
      const tampered = { ...c, parameters: { ...c.parameters, keyPrefix: '0' } };
      await refused(await solve(tampered));
    });

    it('défi signé par une autre clé : 422 challenge_failed', async () => {
      const other = new AltchaService({ ...config, ALTCHA_HMAC_KEY: 'k'.repeat(64) });
      await refused(await solve(await other.create()));
    });

    it('défi expiré : 422 challenge_failed', async () => {
      const expired = await app.get(AltchaService).create(new Date(Date.now() - 11 * 60 * 1000));
      await refused(await solve(expired));
    });

    it('charge « server » (ALTCHA Sentinel, service tiers) : jamais acceptée, 422 challenge_failed', async () => {
      await refused(
        encode({
          algorithm: 'SHA-256',
          verificationData: 'expire=9999999999&verified=true&id=x',
          signature: 'ab',
          verified: true,
        }),
      );
    });

    it('une solution ne sert qu’une fois, même avec une autre Idempotency-Key', async () => {
      const altcha = await solve();
      expect((await submit(demande(altcha))).status).toBe(201);
      await refused(altcha);
      expect(await rows()).toHaveLength(1);
    });

    it('champ piège rempli : 201 d’apparence normale, rien d’enregistré ni publié', async () => {
      const res = await submit(demande(await solve(), { website: 'https://spam.example' }));
      expect(res.status).toBe(201);
      const body = AssociationRequestCreated.parse(await res.json());
      expect(body.reference).toMatch(/^DEM-\d{4}-\d{5}$/);
      expect(await rows()).toEqual([]);
      expect(await events()).toEqual([]);
    });

    it('champ piège : le défi est consommé aussi, son rejeu est refusé comme pour une vraie demande', async () => {
      const altcha = await solve();
      expect((await submit(demande(altcha, { website: 'https://spam.example' }))).status).toBe(201);
      await refused(altcha);
    });

    it('champ piège et plan inconnu : même 422 qu’une vraie demande (aucun signal au robot)', async () => {
      const res = await submit(
        demande(await solve(), {
          website: 'https://spam.example',
          needs: { estimatedSubscribers: '1_20', desiredPlanId: crypto.randomUUID() },
        }),
      );
      expect(res.status).toBe(422);
      expect(await codeOf(res)).toBe('validation_failed');
    });

    it('pas d’adresse IP en clair dans les clés de limitation et d’anti-rejeu', async () => {
      expect((await submit(demande(await solve()))).status).toBe(201);
      const keys = (await redis.exec(['redis-cli', '--scan', '--pattern', 'cotiz:*'])).output
        .split('\n')
        .filter((k) => k.startsWith('cotiz:rl:pub.request:') || k.startsWith('cotiz:altcha:'));
      expect(keys).toHaveLength(2);
      for (const k of keys) {
        expect(k).not.toContain('127.0.0.1');
      }
    });

    it('limitation : 5 demandes par heure et par IP, la 6e → 429 too_many_requests avec Retry-After', async () => {
      for (let i = 0; i < 5; i++) expect((await submit(demande(await solve()))).status).toBe(201);
      const res = await submit(demande(await solve()));
      expect(res.status).toBe(429);
      expect(await codeOf(res)).toBe('too_many_requests');
      expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(60);
      expect(await rows()).toHaveLength(5);
    });

    it('les essais refusés (défi faux) comptent aussi dans la limite', async () => {
      for (let i = 0; i < 5; i++) await refused('pas-du-base64');
      const res = await submit(demande(await solve()));
      expect(res.status).toBe(429);
    });
  });
});
