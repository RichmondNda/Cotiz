import { setTimeout as sleep } from 'node:timers/promises';
import {
  type CanActivate,
  Controller,
  type ExecutionContext,
  Get,
  type INestApplication,
  Injectable,
  Logger,
  Module,
  NotFoundException,
  Post,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { runMigrations } from '@cotiz/db/migrate';
import { ROLE_PASSWORDS, startTestDatabase, type TestDatabase } from '@cotiz/db/testing';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { GenericContainer, Network, type StartedNetwork, type StartedTestContainer, Wait } from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import {
  currentTx,
  setRequestContext,
  type Space,
  type TenantContext,
  TenantDatabase,
  WithoutTenantContext,
} from '../../src/shared/tenant-context/index.js';
import { asSelf } from '../../src/shared/tenant-context/self.js';

const A = '00000000-0000-7000-8000-00000000a001';
const B = '00000000-0000-7000-8000-00000000a002';
const MOUSSA = '00000000-0000-7000-8000-000000000002';

/** Remplace, pour le test, la garde d'authentification (lot 1.1) : contexte lu dans des en-têtes. */
@Injectable()
class HeaderContextGuard implements CanActivate {
  constructor(private readonly db: TenantDatabase) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    if (req.headers['x-test-guard-task']) {
      // Une garde qui tenterait d'accéder à la base par une tâche, avec un contexte de son choix.
      try {
        await this.db.withTenantContext({ space: 'association', associationId: B }, () => Promise.resolve());
        seen.guardError = null;
      } catch (error) {
        seen.guardError = (error as Error).message;
      }
    }
    const space = req.headers['x-test-space'];
    if (space) {
      setRequestContext(req, {
        space: space as Space,
        associationId: req.headers['x-test-aid'],
        userId: req.headers['x-test-uid'],
      });
    }
    return true;
  }
}

/** Observations faites dans les contrôleurs, hors de la réponse HTTP. */
const seen: {
  insertedBeforeThrow?: string;
  late?: string;
  traced?: boolean;
  guardError?: string | null;
  lastError?: string;
} = {};

/** Dernière erreur 500 : la réponse ne la montre pas, ProblemFilter la journalise (objet `{ msg, err }`). */
vi.spyOn(Logger.prototype, 'error').mockImplementation((message: unknown) => {
  seen.lastError = typeof message === 'string' ? message : JSON.stringify(message);
});

async function countLabel(label: string): Promise<string | undefined> {
  const res = await currentTx().execute<{ n: string }>(
    sql`SELECT count(*) AS n FROM isolation_probe WHERE label = ${label}`,
  );
  return res.rows[0]?.n;
}

async function readProbe() {
  const labels = await currentTx().execute<{ label: string }>(sql`SELECT label FROM isolation_probe ORDER BY label`);
  // Entrelace les requêtes simultanées : le second currentTx() doit retrouver la transaction de cette requête.
  await sleep(Math.floor(Math.random() * 20));
  const ctx = await currentTx().execute<{ aid: string | null; uid: string | null; space: string }>(
    sql`SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space`,
  );
  return { labels: labels.rows.map((r) => r.label), ctx: ctx.rows[0] };
}

async function insertLabel(label: string): Promise<void> {
  await currentTx().execute(
    sql`INSERT INTO isolation_probe (association_id, label) VALUES (app_association_id(), ${label})`,
  );
}

@Controller('probe')
class ProbeController {
  constructor(private readonly db: TenantDatabase) {}

  @Get('trace')
  trace() {
    seen.traced = true;
    return { ok: true };
  }

  @Get('system-depuis-route')
  @WithoutTenantContext()
  async systemFromRoute() {
    return this.attempt(() => this.db.withTenantContext({ space: 'system' }, () => Promise.resolve('exécuté')));
  }

  @Get('tache-sans-contexte')
  @WithoutTenantContext()
  async taskFromRouteWithoutContext() {
    return this.attempt(() =>
      this.db.withTenantContext({ space: 'association', associationId: B }, () => Promise.resolve('exécuté')),
    );
  }

  @Get('tache-depuis-requete')
  async taskFromRequest() {
    return this.attempt(() =>
      this.db.withTenantContext({ space: 'association', associationId: A }, () => Promise.resolve('exécuté')),
    );
  }

  private async attempt(fn: () => Promise<string>) {
    try {
      return { result: await fn() };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
  @Get('rows')
  rows() {
    return readProbe();
  }

  @Post('ok')
  async ok() {
    await insertLabel('valide');
    return { ok: true };
  }

  @Post('fail')
  async fail() {
    await insertLabel('fantome');
    seen.insertedBeforeThrow = await countLabel('fantome');
    throw new Error('échec après écriture');
  }

  @Post('introuvable')
  async notFound() {
    await insertLabel('fantome-404');
    throw new NotFoundException();
  }

  @Post('vide')
  async empty(): Promise<void> {
    await insertLabel('vide');
  }

  @Post('apres')
  after() {
    // Continuation détachée : elle s'exécute après la réponse, donc après le COMMIT.
    setTimeout(() => {
      try {
        currentTx();
        seen.late = 'transaction encore accessible';
      } catch (error) {
        seen.late = (error as Error).message;
      }
    }, 50);
    return { ok: true };
  }

  @Get('sans-contexte')
  @WithoutTenantContext()
  withoutContext() {
    try {
      currentTx();
      return { error: null };
    } catch (error) {
      return { error: (error as Error).message };
    }
  }
}

describe('shared/tenant-context (api, à travers PgBouncer en mode transaction)', () => {
  let network: StartedNetwork;
  let db: TestDatabase;
  let pgbouncer: StartedTestContainer;
  let bouncerUrl: string;
  let app: INestApplication;
  let baseUrl: string;

  async function exec(url: string, text: string): Promise<pg.QueryResult> {
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
      return await client.query(text);
    } finally {
      await client.end();
    }
  }

  async function countAsSuperuser(label: string): Promise<string> {
    const res = await exec(db.superuserUrl, `SELECT count(*) AS n FROM isolation_probe WHERE label = '${label}'`);
    return (res.rows[0] as { n: string }).n;
  }

  async function get(path: string, headers: Record<string, string> = {}) {
    const res = await fetch(`${baseUrl}/probe/${path}`, { headers });
    return { status: res.status, body: (await res.json()) as Awaited<ReturnType<typeof readProbe>> };
  }

  const post = (path: string, headers: Record<string, string> = {}) =>
    fetch(`${baseUrl}/probe/${path}`, { method: 'POST', headers });

  const asManagerOf = (aid: string) => ({ 'x-test-space': 'association', 'x-test-aid': aid });

  beforeAll(async () => {
    network = await new Network().start();
    db = await startTestDatabase({ network });
    await runMigrations(db.urlFor('cotiz_migrator'));
    await exec(
      db.urlFor('cotiz_migrator'),
      `CREATE TABLE isolation_probe (id serial PRIMARY KEY, association_id uuid NOT NULL, label text NOT NULL);
       ALTER TABLE isolation_probe ENABLE ROW LEVEL SECURITY;
       ALTER TABLE isolation_probe FORCE ROW LEVEL SECURITY;
       CREATE POLICY tenant_isolation ON isolation_probe
         USING (association_id = app_association_id()) WITH CHECK (association_id = app_association_id());`,
    );
    await exec(
      db.superuserUrl,
      `INSERT INTO isolation_probe (association_id, label) VALUES ('${A}', 'a1'), ('${A}', 'a2'), ('${B}', 'b1')`,
    );
    // Une seule connexion serveur : toutes les transactions la partagent, comme sous charge en production.
    pgbouncer = await new GenericContainer('edoburu/pgbouncer:v1.24.1-p1')
      .withNetwork(network)
      .withEnvironment({
        DB_HOST: 'postgres',
        DB_USER: 'cotiz_app',
        DB_PASSWORD: ROLE_PASSWORDS.cotiz_app,
        AUTH_TYPE: 'scram-sha-256',
        POOL_MODE: 'transaction',
        MAX_PREPARED_STATEMENTS: '100',
        DEFAULT_POOL_SIZE: '1',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    const url = new URL(db.urlFor('cotiz_app'));
    url.host = `${pgbouncer.getHost()}:${String(pgbouncer.getMappedPort(5432))}`;
    bouncerUrl = url.toString();

    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: bouncerUrl,
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
    });
    @Module({})
    class TestRoot {}
    app = await NestFactory.create(
      {
        module: TestRoot,
        imports: [AppModule.register(config, { guards: [HeaderContextGuard] })],
        controllers: [ProbeController],
      },
      { logger: false },
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await pgbouncer.stop();
    await db.container.stop();
    await network.stop();
  });

  it('une requête sans contexte voit 0 ligne, espace « none », même juste après une requête de A', async () => {
    expect((await get('rows', asManagerOf(A))).body.labels).toEqual(['a1', 'a2']);
    const { status, body } = await get('rows');
    expect(status).toBe(200);
    expect(body).toEqual({ labels: [], ctx: { aid: null, uid: null, space: 'none' } });
  });

  it('un gestionnaire ne voit que les lignes de son association', async () => {
    expect((await get('rows', asManagerOf(A))).body.labels).toEqual(['a1', 'a2']);
    expect((await get('rows', asManagerOf(B))).body.labels).toEqual(['b1']);
  });

  it('des requêtes simultanées gardent chacune leur contexte d’un bout à l’autre', async () => {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => get('rows', asManagerOf(i % 2 ? B : A))));
    results.forEach((r, i) => {
      expect(r.body.labels).toEqual(i % 2 ? ['b1'] : ['a1', 'a2']);
      expect(r.body.ctx?.aid).toBe(i % 2 ? B : A);
    });
  });

  it('une requête réussie valide ses écritures', async () => {
    const res = await post('ok', asManagerOf(A));
    expect(res.status).toBe(201);
    expect(await countAsSuperuser('valide')).toBe('1');
    await exec(db.superuserUrl, "DELETE FROM isolation_probe WHERE label = 'valide'");
  });

  it('une réponse vide valide aussi ses écritures', async () => {
    const res = await post('vide', asManagerOf(A));
    expect(res.status).toBe(201);
    expect(await countAsSuperuser('vide')).toBe('1');
    await exec(db.superuserUrl, "DELETE FROM isolation_probe WHERE label = 'vide'");
  });

  it('une erreur dans le contrôleur annule la transaction', async () => {
    const res = await post('fail', asManagerOf(A));
    expect(res.status).toBe(500);
    // L'écriture avait bien eu lieu dans la transaction : son absence prouve l'annulation.
    expect(seen.insertedBeforeThrow).toBe('1');
    expect(await countAsSuperuser('fantome')).toBe('0');
  });

  it('une HttpException garde son statut et annule la transaction', async () => {
    const res = await post('introuvable', asManagerOf(A));
    expect(res.status).toBe(404);
    expect(await countAsSuperuser('fantome-404')).toBe('0');
  });

  it('une continuation détachée ne peut plus utiliser la transaction après la réponse', async () => {
    expect((await post('apres', asManagerOf(A))).status).toBe(201);
    await sleep(150);
    expect(seen.late).toMatch(/après la fin de la transaction/);
  });

  it('une route @WithoutTenantContext() n’a pas de transaction', async () => {
    const res = await fetch(`${baseUrl}/probe/sans-contexte`, { headers: asManagerOf(A) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ error: expect.stringMatching(/hors contexte tenant/) as unknown });
  });

  it('le contexte reste local à la transaction : rien ne subsiste sur la connexion PgBouncer', async () => {
    await get('rows', asManagerOf(A));
    const after = await exec(bouncerUrl, 'SELECT app_association_id() AS aid, app_space() AS space');
    expect(after.rows[0]).toEqual({ aid: null, space: 'none' });
  });

  it('un SET de session laissé sur la connexion PgBouncer est écrasé par chaque contexte', async () => {
    // Un SET hors transaction survit sur la connexion serveur partagée (mode transaction) : vérifié d'abord.
    await exec(bouncerUrl, `SET app.association_id = '${A}'`);
    try {
      const leaked = await exec(bouncerUrl, 'SELECT app_association_id() AS aid');
      expect(leaked.rows[0]).toEqual({ aid: A });

      const subscriber = await get('rows', { 'x-test-space': 'subscriber', 'x-test-uid': MOUSSA });
      expect(subscriber.body).toEqual({ labels: [], ctx: { aid: null, uid: MOUSSA, space: 'subscriber' } });
      expect((await get('rows')).body.labels).toEqual([]);
    } finally {
      await exec(bouncerUrl, 'RESET ALL');
    }
  });

  describe('espace system : réservé au worker', () => {
    it.each([
      ['sans associationId', { 'x-test-space': 'system' }],
      ['avec associationId', { 'x-test-space': 'system', 'x-test-aid': A }],
    ])('une garde qui pose l’espace system (%s) fait échouer la requête avant le contrôleur', async (_n, headers) => {
      seen.traced = false;
      seen.lastError = undefined;
      const res = await fetch(`${baseUrl}/probe/trace`, { headers });
      expect(res.status).toBe(500);
      expect(seen.lastError).toMatch(/espace system interdit depuis une requête HTTP/);
      expect(seen.traced).toBe(false);
    });

    it('une garde ne peut pas ouvrir de tâche withTenantContext()', async () => {
      seen.guardError = undefined;
      await fetch(`${baseUrl}/probe/trace`, { headers: { 'x-test-guard-task': '1' } });
      expect(seen.guardError).toMatch(/requête HTTP/);
    });

    it('withTenantContext() est refusé depuis une route sans contexte, même pour une association', async () => {
      const res = await fetch(`${baseUrl}/probe/tache-sans-contexte`);
      expect(await res.json()).toEqual({ error: expect.stringMatching(/requête HTTP/) as unknown });
    });

    it('withTenantContext({ space: system }) est refusé depuis un contrôleur HTTP', async () => {
      const res = await fetch(`${baseUrl}/probe/system-depuis-route`);
      expect(await res.json()).toEqual({ error: expect.stringMatching(/requête HTTP/) as unknown });
    });

    it('withTenantContext() est refusé depuis une requête HTTP, même pour une association', async () => {
      const res = await fetch(`${baseUrl}/probe/tache-depuis-requete`, { headers: asManagerOf(A) });
      expect(await res.json()).toEqual({ error: expect.stringMatching(/requête HTTP/) as unknown });
    });

    it('le processus api refuse l’espace system, même hors requête', async () => {
      const tenantDb = app.get(TenantDatabase);
      let called = false;
      await expect(
        tenantDb.withTenantContext({ space: 'system' }, () => {
          called = true;
          return Promise.resolve(1);
        }),
      ).rejects.toThrow(/réservé au worker/);
      expect(called).toBe(false);
    });
  });

  describe('TenantDatabase', () => {
    it('refuse les contextes imbriqués', async () => {
      const tenantDb = app.get(TenantDatabase);
      const ctx: TenantContext = { space: 'association', associationId: A };
      await expect(
        tenantDb.withTenantContext(ctx, () => tenantDb.withTenantContext(ctx, () => Promise.resolve(1))),
      ).rejects.toThrow(/imbriqué/);
    });

    it('withTenantContext() exige un contexte', async () => {
      const tenantDb = app.get(TenantDatabase);
      await expect(
        tenantDb.withTenantContext(null as unknown as TenantContext, () => Promise.resolve(1)),
      ).rejects.toThrow(/contexte requis/);
    });

    it.each<[string, TenantContext, RegExp]>([
      ['associationId non UUID', { space: 'association', associationId: "x' OR true --" }, /associationId/],
      ['userId non UUID', { space: 'subscriber', userId: 'moussa' }, /userId/],
      ['espace inconnu', { space: 'root' as Space }, /space invalide/],
      ['association sans associationId ni userId', { space: 'association' }, /associationId ou userId requis/],
      ['subscriber sans userId', { space: 'subscriber' }, /userId requis/],
      ['subscriber avec associationId', { space: 'subscriber', userId: MOUSSA, associationId: A }, /interdit/],
      ['public avec associationId', { space: 'public', associationId: A }, /interdit/],
      ['auth avec associationId', { space: 'auth', associationId: A }, /interdit/],
      ['platform avec associationId', { space: 'platform', associationId: A }, /interdit/],
    ])('refuse un contexte invalide (%s) sans exécuter la fonction', async (_name, context, message) => {
      const tenantDb = app.get(TenantDatabase);
      let called = false;
      await expect(
        tenantDb.withTenantContext(context, () => {
          called = true;
          return Promise.resolve(1);
        }),
      ).rejects.toThrow(message);
      expect(called).toBe(false);
    });

    it('des transactions réellement simultanées gardent chacune leur contexte', async () => {
      // Pool direct de 12 connexions : derrière PgBouncer (1 connexion serveur), les transactions s'enchaînent
      // au lieu de s'entrelacer.
      const parallel = new TenantDatabase({ connectionString: db.urlFor('cotiz_app'), max: 12 });
      try {
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            parallel.withTenantContext({ space: 'association', associationId: i % 2 ? B : A }, readProbe),
          ),
        );
        results.forEach((r, i) => {
          expect(r.labels).toEqual(i % 2 ? ['b1'] : ['a1', 'a2']);
          expect(r.ctx?.aid).toBe(i % 2 ? B : A);
        });
      } finally {
        await parallel.onModuleDestroy();
      }
    });

    describe('asSelf() : lecture « de soi » dans la transaction en cours', () => {
      const probe = async () => {
        const labels = await currentTx().execute<{ label: string }>(
          sql`SELECT label FROM isolation_probe ORDER BY label`,
        );
        const ctx = await currentTx().execute<{ aid: string | null; uid: string | null; space: string }>(
          sql`SELECT app_association_id() AS aid, app_user_id() AS uid, app_space() AS space`,
        );
        return { labels: labels.rows.map((r) => r.label), ctx: ctx.rows[0] };
      };
      const inA = <T>(fn: () => Promise<T>) =>
        app.get(TenantDatabase).withTenantContext({ space: 'association', associationId: A }, fn);
      const contextA = { labels: ['a1', 'a2'], ctx: { aid: A, uid: null, space: 'association' } };

      it('fn voit l’espace auth de la personne, puis le contexte de A est rétabli', async () => {
        const seen = await inA(async () => ({ inside: await asSelf(MOUSSA, probe), after: await probe() }));
        expect(seen).toEqual({
          inside: { labels: [], ctx: { aid: null, uid: MOUSSA, space: 'auth' } },
          after: contextA,
        });
      });

      it('fn en erreur : l’erreur passe, le contexte de A est rétabli', async () => {
        const after = await inA(async () => {
          await expect(asSelf(MOUSSA, () => Promise.reject(new Error('refus métier')))).rejects.toThrow('refus métier');
          return probe();
        });
        expect(after).toEqual(contextA);
      });

      it('erreur SQL dans fn : l’erreur d’origine passe, la transaction n’est plus utilisable', async () => {
        await expect(
          inA(async () => {
            await expect(asSelf(MOUSSA, () => currentTx().execute(sql`SELECT 1 / 0`))).rejects.toThrow(
              /Failed query: SELECT 1 \/ 0/,
            );
            return probe();
          }),
        ).rejects.toThrow(/terminée|fin de la transaction/);
      });

      it('la transaction d’avant est suspendue pendant fn : ni currentTx() ni une transaction capturée', async () => {
        const errors = await inA(async () => {
          const captured = currentTx();
          const results = await Promise.allSettled([
            asSelf(MOUSSA, async () => {
              await sleep(30);
              return probe();
            }),
            Promise.resolve().then(() => currentTx()),
            (async () => captured.execute(sql`SELECT label FROM isolation_probe`))(),
          ]);
          return results.map((r) => (r.status === 'rejected' ? (r.reason as Error).message : 'ok'));
        });
        expect(errors[0]).toBe('ok');
        expect(errors[1]).toMatch(/pendant une lecture « de soi »/);
        expect(errors[2]).toMatch(/suspendue/);
      });

      it('deux asSelf() concurrents sur la même transaction : le second est refusé', async () => {
        const results = await inA(() =>
          Promise.allSettled([
            asSelf(MOUSSA, () => sleep(30).then(probe)),
            asSelf('00000000-0000-7000-8000-000000000003', probe),
          ]),
        );
        expect(results[0].status).toBe('fulfilled');
        expect(results[1].status).toBe('rejected');
        expect(results[1].status === 'rejected' && (results[1].reason as Error).message).toMatch(/concurrent/);
      });

      it('asSelf() hors contexte, ou avec un userId invalide : refusé', async () => {
        await expect(asSelf(MOUSSA, () => Promise.resolve(1))).rejects.toThrow(/hors contexte/);
        await expect(inA(() => asSelf('moussa', () => Promise.resolve(1)))).rejects.toThrow(/userId/);
        expect(await inA(probe)).toEqual(contextA);
      });
    });

    it('currentTx() hors contexte lève une erreur', () => {
      expect(() => currentTx()).toThrow(/hors contexte/);
    });
  });
});
