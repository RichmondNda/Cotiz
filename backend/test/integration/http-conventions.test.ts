import { Body, Controller, Get, HttpCode, type INestApplication, Module, Patch, Post } from '@nestjs/common';
import { updateWithVersion } from '@cotiz/db';
import { sql } from 'drizzle-orm';
import { integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { NestFactory } from '@nestjs/core';
import { Problem } from '@cotiz/contracts';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { DomainProblem, Endpoint, expectedVersion } from '../../src/shared/http/index.js';
import { currentTx } from '../../src/shared/tenant-context/index.js';
import { A, B, type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';
import { as, TestAuthGuard } from '../support/test-auth.js';

/**
 * Conventions HTTP de bout en bout (architecture/06), à travers AppModule et un vrai Redis : problem+json pour toute
 * erreur, X-Request-Id, limitation de débit, Idempotency-Key, If-Match et ETag. Routes de test rattachées à des
 * endpoints du contrat qui portent les drapeaux (me.declare : idempotencyKey ; as.patch : ifMatch ; fl.upload :
 * rateLimited).
 */

let declared = 0;
/** Échecs restants de la route `declare-flaky` (opération annulée puis renvoyée avec la même clé). */
let flakyFailures = 0;

const RECORD = '00000000-0000-7000-8000-0000000ab001';
/** Table versionnée de test (verrou optimiste), créée comme une migration avec sa RLS. */
const versionedProbe = pgTable('versioned_probe', {
  id: uuid('id').primaryKey(),
  associationId: uuid('association_id').notNull(),
  label: text('label').notNull(),
  version: integer('version').notNull().default(1),
});

@Controller('conventions-probe')
class ProbeController {
  @Post('declare')
  @Endpoint('me.declare', 'declare')
  @HttpCode(201)
  declare(@Body() body: { amount: number }) {
    declared++;
    return { id: `p${String(declared)}`, amount: body.amount };
  }

  @Patch('patch')
  @Endpoint('as.patch', 'patch')
  patch() {
    return { id: A.id, version: expectedVersion() + 1 };
  }

  /** Écrit, puis échoue la première fois : la transaction est annulée et rien n'est mémorisé. */
  @Post('declare-flaky')
  @Endpoint('me.declare', 'declare')
  @HttpCode(201)
  async declareFlaky(@Body() body: { label: string }) {
    await currentTx().execute(sql`INSERT INTO idem_probe (label) VALUES (${body.label})`);
    if (flakyFailures-- > 0) throw new DomainProblem('invalid_state');
    return { label: body.label };
  }

  /** Mise à jour versionnée (If-Match → updateWithVersion) : 412 si périmée, de bout en bout. */
  @Patch('versioned')
  @Endpoint('as.patch', 'patch')
  async versioned(@Body() body: { label: string }) {
    const row = await updateWithVersion(
      currentTx(),
      versionedProbe,
      { id: RECORD, version: expectedVersion() },
      {
        label: body.label,
      },
    );
    if (!row) throw new DomainProblem('not_found');
    return { id: row.id, label: row.label, version: row.version };
  }

  /** Écriture pour une autre association : refus RLS 42501. */
  @Post('foreign-write')
  @Endpoint('as.get', 'get')
  async foreignWrite() {
    await currentTx().execute(
      sql`INSERT INTO versioned_probe (id, association_id, label) VALUES (gen_random_uuid(), ${B.id}, 'intrus')`,
    );
    return { written: true };
  }

  @Post('upload')
  @Endpoint('fl.upload', 'create')
  upload() {
    return { ok: true };
  }

  @Get('boom')
  @Endpoint('as.get', 'get')
  boom(): never {
    throw new Error('détail interne à ne jamais montrer');
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const moussa = as({ space: 'subscriber', userId: USERS.moussa, role: 'subscriber' });
const awa = as({ space: 'association', associationId: A.id, userId: USERS.awa, role: 'owner' });
const json = { 'content-type': 'application/json' };

describe('conventions HTTP (AppModule, Redis réel)', () => {
  let h: IsolationHarness;
  let redis: StartedRedisContainer;
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    [h, redis] = await Promise.all([startIsolationHarness('migrated'), new RedisContainer('redis:7-alpine').start()]);
    await h.migrator(`
      CREATE TABLE versioned_probe (id uuid PRIMARY KEY, association_id uuid NOT NULL, label text NOT NULL,
                                    version int NOT NULL DEFAULT 1);
      ALTER TABLE versioned_probe ENABLE ROW LEVEL SECURITY;
      ALTER TABLE versioned_probe FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON versioned_probe
        USING (association_id = app_association_id()) WITH CHECK (association_id = app_association_id());
      -- Écritures d'un souscripteur dans la transaction de la requête (aucune donnée de tenant).
      CREATE TABLE idem_probe (id serial PRIMARY KEY, label text NOT NULL);`);
    await h.superuser(`INSERT INTO versioned_probe (id, association_id, label, version) VALUES ($1, $2, 'v3', 3)`, [
      RECORD,
      A.id,
    ]);
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: redis.getConnectionUrl(),
      S3_ENDPOINT: 'http://127.0.0.1:1',
      RATE_LIMIT_ENDPOINT_PER_MIN: '3',
      RATE_LIMIT_IP_PER_MIN: '1000',
    });
    @Module({
      imports: [AppModule.register(config, { guards: [TestAuthGuard] }), ProbeModule],
    })
    class TestRoot {}
    app = await NestFactory.create(TestRoot, { logger: false });
    configureApp(app, config);
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await Promise.all([h.stop(), redis.stop()]);
  });

  describe('problem+json', () => {
    it('route inconnue → 404 not_found, avec le X-Request-Id renvoyé', async () => {
      const res = await fetch(`${base}/inexistante`, { headers: { 'x-request-id': 'req-404' } });
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toContain('application/problem+json');
      expect(res.headers.get('x-request-id')).toBe('req-404');
      expect(Problem.parse(await res.json())).toMatchObject({ code: 'not_found', requestId: 'req-404' });
    });

    it('JSON illisible → 422 validation_failed', async () => {
      const res = await fetch(`${base}/conventions-probe/declare`, {
        method: 'POST',
        headers: { ...moussa, ...json, 'idempotency-key': 'cle-json-illisible' },
        body: '{"amount": ',
      });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed' });
    });

    it('erreur inattendue → 500 internal_error, sans le message interne', async () => {
      const res = await fetch(`${base}/conventions-probe/boom`, { headers: awa });
      expect(res.status).toBe(500);
      const text = await res.text();
      expect(Problem.parse(JSON.parse(text)).code).toBe('internal_error');
      expect(text).not.toContain('détail interne');
    });
  });

  describe('Idempotency-Key (Redis)', () => {
    // me.declare est aussi limité en débit (3 par minute ici, rejeux compris) : un souscripteur par test.
    const declare = (key: string, amount: number, userId: string) =>
      fetch(`${base}/conventions-probe/declare`, {
        method: 'POST',
        headers: { ...as({ space: 'subscriber', userId, role: 'subscriber' }), ...json, 'idempotency-key': key },
        body: JSON.stringify({ amount }),
      });

    it('même clé, même corps : réponse rejouée, opération exécutée une seule fois', async () => {
      const before = declared;
      const first = await declare('0b1c2d3e-aaaa-4a61-8b72-93a4b5c6d7e8', 25000, USERS.fatou);
      const replay = await declare('0b1c2d3e-aaaa-4a61-8b72-93a4b5c6d7e8', 25000, USERS.fatou);
      expect([first.status, replay.status]).toEqual([201, 201]);
      expect(await replay.json()).toEqual(await first.json());
      expect(replay.headers.get('idempotent-replayed')).toBe('true');
      expect(declared).toBe(before + 1);
    });

    it('même clé, autre corps → 422 idempotency_key_reused', async () => {
      await declare('0b1c2d3e-bbbb-4a61-8b72-93a4b5c6d7e8', 25000, USERS.aminata);
      const reused = await declare('0b1c2d3e-bbbb-4a61-8b72-93a4b5c6d7e8', 30000, USERS.aminata);
      expect(reused.status).toBe(422);
      expect(await reused.json()).toMatchObject({ code: 'idempotency_key_reused' });
    });

    it('réponse mémorisée 24 h dans Redis, clé propre à l’utilisateur', async () => {
      expect((await declare('0b1c2d3e-cccc-4a61-8b72-93a4b5c6d7e8', 1000, USERS.koffi)).status).toBe(201);
      const key = `cotiz:idem:${USERS.koffi}:me.declare:0b1c2d3e-cccc-4a61-8b72-93a4b5c6d7e8`;
      const ttl = Number((await redis.executeCliCmd('TTL', [key])).trim());
      expect(ttl).toBeGreaterThan(24 * 3600 - 60);
      expect(ttl).toBeLessThanOrEqual(24 * 3600);
    });
  });

  describe('If-Match et ETag', () => {
    it('version transmise au cas d’usage, ETag de la nouvelle version', async () => {
      const res = await fetch(`${base}/conventions-probe/patch`, {
        method: 'PATCH',
        headers: { ...awa, 'if-match': 'W/"3"' },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toBe('W/"4"');
    });

    it('If-Match absent → 422 validation_failed', async () => {
      const res = await fetch(`${base}/conventions-probe/patch`, { method: 'PATCH', headers: awa });
      expect(res.status).toBe(422);
      expect(await res.json()).toMatchObject({ code: 'validation_failed', fields: { 'If-Match': 'required' } });
    });
  });

  describe('limitation de débit (Redis)', () => {
    it('endpoint rateLimited : au-delà du quota par utilisateur, 429 et Retry-After', async () => {
      const upload = () => fetch(`${base}/conventions-probe/upload`, { method: 'POST', headers: awa });
      for (let i = 0; i < 3; i++) expect((await upload()).status).toBe(201);
      const limited = await upload();
      expect(limited.status).toBe(429);
      expect(await limited.json()).toMatchObject({ code: 'too_many_requests' });
      const retryAfter = Number(limited.headers.get('retry-after'));
      expect(retryAfter).toBeGreaterThan(0);
      expect(retryAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('compléments de bout en bout', () => {
    const declare = (path: string, key: string, body: unknown, userId: string) =>
      fetch(`${base}/conventions-probe/${path}`, {
        method: 'POST',
        headers: { ...as({ space: 'subscriber', userId, role: 'subscriber' }), ...json, 'idempotency-key': key },
        body: JSON.stringify(body),
      });

    it('même clé et même corps, autre utilisateur : sa propre opération, jamais la réponse du premier', async () => {
      const key = '0b1c2d3e-dddd-4a61-8b72-93a4b5c6d7e8';
      const before = declared;
      const first = (await (await declare('declare', key, { amount: 7 }, USERS.awa)).json()) as { id: string };
      const other = (await (await declare('declare', key, { amount: 7 }, USERS.koffi)).json()) as { id: string };
      expect(declared).toBe(before + 2);
      expect(other.id).not.toBe(first.id);
    });

    it('opération annulée : écriture annulée, rien de mémorisé, la même clé est rejouable', async () => {
      flakyFailures = 1;
      const key = '0b1c2d3e-eeee-4a61-8b72-93a4b5c6d7e8';
      const failed = await declare('declare-flaky', key, { label: 'flaky' }, USERS.moussa);
      expect(failed.status).toBe(409);
      const retried = await declare('declare-flaky', key, { label: 'flaky' }, USERS.moussa);
      expect(retried.status).toBe(201);
      expect(retried.headers.get('idempotent-replayed')).toBeNull();
      const { rows } = await h.superuser(`SELECT count(*)::int AS n FROM idem_probe WHERE label = 'flaky'`);
      expect(rows[0]).toEqual({ n: 1 });
    });

    it('version périmée → 412 version_conflict sans détail ; version courante → ETag de la nouvelle', async () => {
      const patch = (version: number) =>
        fetch(`${base}/conventions-probe/versioned`, {
          method: 'PATCH',
          headers: { ...awa, ...json, 'if-match': `W/"${String(version)}"` },
          body: JSON.stringify({ label: `après ${String(version)}` }),
        });
      const stale = await patch(2);
      expect(stale.status).toBe(412);
      const problem = (await stale.json()) as Record<string, unknown>;
      expect(problem).toMatchObject({ code: 'version_conflict' });
      expect(Object.keys(problem).sort()).toEqual(['code', 'requestId', 'status', 'title', 'type']);
      const current = await patch(3);
      expect(current.status).toBe(200);
      expect(current.headers.get('etag')).toBe('W/"4"');
    });

    it('écriture pour une autre association (refus RLS 42501) → 404 not_found, sans nom de table', async () => {
      const res = await fetch(`${base}/conventions-probe/foreign-write`, { method: 'POST', headers: awa });
      expect(res.status).toBe(404);
      const text = await res.text();
      expect(JSON.parse(text)).toMatchObject({ code: 'not_found' });
      expect(text).not.toContain('versioned_probe');
      const { rows } = await h.superuser(`SELECT 1 FROM versioned_probe WHERE label = 'intrus'`);
      expect(rows).toEqual([]);
    });
  });

  describe('plafond par IP (avant les gardes) et proxys de confiance', () => {
    async function smallApp(trustProxyHops: number) {
      const config = loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: h.db.urlFor('cotiz_app'),
        REDIS_URL: redis.getConnectionUrl(),
        S3_ENDPOINT: 'http://127.0.0.1:1',
        RATE_LIMIT_IP_PER_MIN: '2',
        TRUST_PROXY_HOPS: String(trustProxyHops),
      });
      const small = await NestFactory.create(AppModule.register(config), { logger: false });
      configureApp(small, config);
      await small.listen(0, '127.0.0.1');
      return { small, url: `${await small.getUrl()}/api/v1` };
    }

    it('sans proxy de confiance : X-Forwarded-For ignoré, toutes les requêtes comptent pour l’IP réelle', async () => {
      await redis.executeCliCmd('FLUSHALL');
      const { small, url } = await smallApp(0);
      try {
        const statuses = [];
        for (const forwarded of ['198.51.100.1', '198.51.100.2', '198.51.100.3']) {
          statuses.push((await fetch(`${url}/inexistante`, { headers: { 'x-forwarded-for': forwarded } })).status);
        }
        expect(statuses).toEqual([404, 404, 429]);
      } finally {
        await small.close();
      }
    });

    it('avec un proxy de confiance : chaque client compte pour son IP', async () => {
      await redis.executeCliCmd('FLUSHALL');
      const { small, url } = await smallApp(1);
      try {
        const call = (ip: string) => fetch(`${url}/inexistante`, { headers: { 'x-forwarded-for': ip } });
        expect([(await call('198.51.100.1')).status, (await call('198.51.100.2')).status]).toEqual([404, 404]);
        expect([(await call('198.51.100.1')).status, (await call('198.51.100.1')).status]).toEqual([404, 429]);
      } finally {
        await small.close();
      }
    });

    it('un proxy de confiance (Traefik ; Nitro recopie l’en-tête) : une adresse falsifiée par le client est ignorée', async () => {
      // Traefik ajoute l'adresse du client à la fin de X-Forwarded-For ; le proxy Nitro du front recopie l'en-tête sans
      // rien ajouter (h3 proxyRequest). Avec TRUST_PROXY_HOPS=1, seule l'adresse ajoutée par Traefik compte.
      await redis.executeCliCmd('FLUSHALL');
      const { small, url } = await smallApp(1);
      try {
        const call = (forwarded: string) => fetch(`${url}/inexistante`, { headers: { 'x-forwarded-for': forwarded } });
        const statuses = [];
        for (const spoofed of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
          statuses.push((await call(`${spoofed}, 198.51.100.7`)).status);
        }
        expect(statuses).toEqual([404, 404, 429]);
      } finally {
        await small.close();
      }
    });

    it('requête refusée par une garde ou une route : comptée quand même ; sondes de santé jamais limitées', async () => {
      await redis.executeCliCmd('FLUSHALL');
      const { small, url } = await smallApp(0);
      try {
        for (let i = 0; i < 5; i++) expect((await fetch(`${url}/health/live`)).status).toBe(200);
        expect((await fetch(`${url}/inexistante`)).status).toBe(404);
        expect((await fetch(`${url}/inexistante`)).status).toBe(404);
        const limited = await fetch(`${url}/inexistante`);
        expect(limited.status).toBe(429);
        expect(limited.headers.get('content-type')).toContain('application/problem+json');
        expect(await limited.json()).toMatchObject({ code: 'too_many_requests' });
      } finally {
        await small.close();
      }
    });
  });
});
