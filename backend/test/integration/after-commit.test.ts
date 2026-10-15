import { Controller, Get, type INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { DomainProblem } from '../../src/shared/http/index.js';
import { afterCommit, currentTx, WithoutTenantContext } from '../../src/shared/tenant-context/index.js';
import { A, B, type IsolationHarness, startIsolationHarness, USERS } from '../isolation/harness.js';
import { as, TestAuthGuard } from '../support/test-auth.js';

/**
 * afterCommit() : une requête dont la suite doit attendre un effet du worker (fl.upload › complete). La transaction de
 * la requête est validée d'abord, puis la suite s'exécute dans de nouvelles transactions courtes du même contexte.
 */

const manager = as({ space: 'association', associationId: A.id, userId: USERS.awa, role: 'owner' });

const countProbe = async () =>
  (await currentTx().execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM after_commit_probe`)).rows[0]?.n;

@Controller('after-commit-probe')
class ProbeController {
  /** Écrit, puis relit après le COMMIT : la suite voit l'écriture validée, dans une autre transaction. */
  @Get('write-then-read')
  async writeThenRead() {
    await currentTx().execute(sql`INSERT INTO after_commit_probe (association_id) VALUES (${A.id})`);
    const firstTx = currentTx();
    return afterCommit(async (inContext) => {
      const seen = await inContext(async () => ({ count: await countProbe(), sameTx: currentTx() === firstTx }));
      const context = await inContext(async () => {
        const res = await currentTx().execute<{ aid: string; space: string }>(
          sql`SELECT app_association_id() AS aid, app_space() AS space`,
        );
        return res.rows[0];
      });
      let outsideError = '';
      try {
        currentTx();
      } catch (error) {
        outsideError = (error as Error).message;
      }
      return { ...seen, context, outsideError };
    });
  }

  /** Transaction de la requête capturée puis réutilisée après le COMMIT : refusée, aucune requête SQL. */
  @Get('captured-tx')
  capturedTx() {
    const captured = currentTx();
    return afterCommit((inContext) =>
      inContext(() => captured.execute(sql`INSERT INTO after_commit_probe (association_id) VALUES (${A.id})`)),
    );
  }

  /** Espace souscripteur : la suite garde l'utilisateur. */
  @Get('subscriber')
  subscriber() {
    return afterCommit((inContext) =>
      inContext(async () => {
        const res = await currentTx().execute<{ uid: string; space: string }>(
          sql`SELECT app_user_id() AS uid, app_space() AS space`,
        );
        return res.rows[0];
      }),
    );
  }

  /** La suite échoue : la réponse est l'erreur, l'écriture de la requête reste validée. */
  @Get('write-then-fail')
  async writeThenFail() {
    await currentTx().execute(sql`INSERT INTO after_commit_probe (association_id) VALUES (${A.id})`);
    return afterCommit(() => Promise.reject(new DomainProblem('file_not_clean')));
  }
}

/** Route sans contexte : une suite après COMMIT n'y a pas de sens, elle est refusée (jamais ignorée). */
@Controller('after-commit-probe-without-context')
@WithoutTenantContext()
class WithoutContextController {
  @Get()
  probe() {
    return afterCommit(() => Promise.resolve({ ran: true }));
  }
}

@Module({ controllers: [ProbeController, WithoutContextController] })
class ProbeModule {}

describe('shared/tenant-context : afterCommit()', () => {
  let h: IsolationHarness;
  let app: INestApplication;
  let base: string;

  beforeAll(async () => {
    h = await startIsolationHarness('migrated');
    await h.migrator(`
      CREATE TABLE after_commit_probe (id serial PRIMARY KEY, association_id uuid NOT NULL);
      ALTER TABLE after_commit_probe ENABLE ROW LEVEL SECURITY;
      ALTER TABLE after_commit_probe FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON after_commit_probe
        USING (association_id = app_association_id()) WITH CHECK (association_id = app_association_id());`);
    // Une ligne de B : la suite, dans le contexte de A, ne doit pas la voir.
    await h.superuser('INSERT INTO after_commit_probe (association_id) VALUES ($1)', [B.id]);
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: h.db.urlFor('cotiz_app'),
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
    });
    @Module({
      imports: [AppModule.register(config, { guards: [TestAuthGuard] }), ProbeModule],
    })
    class TestRoot {}
    app = await NestFactory.create(TestRoot, { logger: false });
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/after-commit-probe`;
  });

  afterAll(async () => {
    await app.close();
    await h.stop();
  });

  it('la suite voit l’écriture validée, dans une nouvelle transaction du même contexte', async () => {
    const res = await fetch(`${base}/write-then-read`, { headers: manager });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      count: 1,
      sameTx: false,
      context: { aid: A.id, space: 'association' },
      outsideError: expect.stringMatching(/hors contexte tenant/) as string,
    });
  });

  it('une transaction capturée puis réutilisée après le COMMIT est refusée, sans aucune écriture', async () => {
    const count = async () =>
      ((await h.superuser('SELECT count(*)::int AS n FROM after_commit_probe')).rows[0] as { n: number }).n;
    const before = await count();
    const res = await fetch(`${base}/captured-tx`, { headers: manager });
    expect(res.status).toBe(500);
    expect(await count()).toBe(before);
  });

  it('en espace souscripteur, la suite garde l’utilisateur', async () => {
    const res = await fetch(`${base}/subscriber`, {
      headers: as({ space: 'subscriber', userId: USERS.moussa, role: 'subscriber' }),
    });
    expect(await res.json()).toEqual({ uid: USERS.moussa, space: 'subscriber' });
  });

  it('sur une route sans contexte, une suite après COMMIT est refusée', async () => {
    const res = await fetch(base.replace('after-commit-probe', 'after-commit-probe-without-context'));
    expect(res.status).toBe(500);
  });

  it('une erreur de la suite devient la réponse ; l’écriture de la requête reste validée', async () => {
    const before = (await h.superuser('SELECT count(*)::int AS n FROM after_commit_probe')).rows[0] as { n: number };
    const res = await fetch(`${base}/write-then-fail`, { headers: manager });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ code: 'file_not_clean' });
    const after = (await h.superuser('SELECT count(*)::int AS n FROM after_commit_probe')).rows[0] as { n: number };
    expect(after.n).toBe(before.n + 1);
  });
});
