import { Writable } from 'node:stream';
import { Body, Controller, Get, HttpCode, type INestApplication, Logger, Module, Post, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureApp } from '../../src/app.js';
import { AppModule } from '../../src/app.module.js';
import { loadConfig } from '../../src/config.js';
import { createLogger, pseudonymize } from '../../src/shared/logging/index.js';
import { WithoutTenantContext } from '../../src/shared/tenant-context/index.js';
import { as, TestAuthGuard } from '../support/test-auth.js';

/**
 * Journaux de bout en bout (lot 0.6, étape 1) : une connexion journalisée — y compris par un code imprudent qui
 * journalise le corps reçu — ne laisse ni mot de passe, ni téléphone, ni identifiant d'utilisateur en clair, et
 * chaque ligne porte le requestId, l'association et l'utilisateur pseudonymisé.
 */

const KEY = 'cle-de-test-pseudonymisation-0123456789';
const USER = '00000000-0000-7000-8000-0000000a0001';
const ASSOCIATION = '00000000-0000-7000-8000-0000000ab001';
const PASSWORD = 'S3cret!motdepasse';
const PHONE = '+2250707070707';
/** Code à usage unique dans les paramètres d'une requête SQL en échec : pas un téléphone, masqué quand même. */
const OTP = '482913';
const OTHER_USER = '00000000-0000-7000-8000-0000000b0002';
const OTHER_ASSOCIATION = '00000000-0000-7000-8000-0000000ab002';

const pgError = (code: string, message: string, fields: Record<string, string> = {}) =>
  Object.assign(new Error(message), { code, ...fields });

@Controller('log-probe')
@WithoutTenantContext()
class LoginProbeController {
  private readonly logger = new Logger('AuthProbe');

  /** Simule un cas d'usage de connexion qui journalise, à tort, tout ce qu'il reçoit. */
  @Post('login')
  @HttpCode(200)
  login(@Body() body: { phone: string; password: string }) {
    this.logger.log({ msg: 'tentative de connexion', body });
    this.logger.warn(`échec de connexion pour ${body.phone}`);
    return { ok: true };
  }

  /** Insertion qui échoue (23505) : Drizzle met la requête et ses paramètres dans son message. */
  @Post('fail-sql')
  failSql() {
    throw new DrizzleQueryError(
      'insert into "one_time_codes" ("code_hash", "phone_e164") values ($1, $2)',
      [OTP, PHONE],
      pgError('23505', `duplicate key value: (${PHONE})`, { table: 'one_time_codes', constraint: 'otc_key' }),
    );
  }

  /** Refus RLS : 404 pour le client, avertissement pour l'exploitation. */
  @Post('forbidden')
  forbidden() {
    throw pgError('42501', 'new row violates row-level security policy for table "files"');
  }

  /** Travail asynchrone de durée choisie : des requêtes concurrentes s'entrelacent. */
  @Get('work')
  async work(@Query('ms') ms: string) {
    await new Promise((resolve) => setTimeout(resolve, Number(ms)));
    this.logger.log('travail terminé');
    await new Promise((resolve) => setTimeout(resolve, Number(ms)));
    this.logger.log('second travail terminé');
    return { ok: true };
  }
}

describe('journaux (pino)', () => {
  const lines: Record<string, unknown>[] = [];
  let raw = '';
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      LOG_LEVEL: 'info',
      LOG_PRETTY: 'false',
      LOG_PSEUDONYM_KEY: KEY,
    });
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        raw += chunk.toString();
        for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as never);
        done();
      },
    });
    @Module({
      imports: [
        AppModule.register(config, {
          logger: createLogger(config, { name: 'api', destination }),
          guards: [TestAuthGuard],
        }),
      ],
      controllers: [LoginProbeController],
    })
    class LoggingRoot {}
    app = await NestFactory.create(LoggingRoot, { logger: false });
    configureApp(app, config);
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;

    const res = await fetch(`${baseUrl}/log-probe/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-login-1',
        ...as({ space: 'association', userId: USER, associationId: ASSOCIATION, role: 'manager' }),
      },
      body: JSON.stringify({ phone: PHONE, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    // La ligne d'accès est écrite à la fin de la réponse.
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  const call = (path: string, requestId: string, user: string, association: string, method = 'POST') =>
    fetch(`${baseUrl}/log-probe/${path}`, {
      method,
      headers: {
        'x-request-id': requestId,
        ...as({ space: 'association', userId: user, associationId: association, role: 'manager' }),
      },
    });
  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  afterAll(async () => {
    await app.close();
  });

  it('un journal de connexion ne contient ni mot de passe ni téléphone en clair', () => {
    const ofRequest = lines.filter((l) => l.requestId === 'req-login-1');
    expect(ofRequest.map((l) => l.msg)).toEqual(
      expect.arrayContaining(['tentative de connexion', expect.stringMatching(/^échec de connexion pour /)]),
    );
    expect(raw).not.toContain(PASSWORD);
    expect(raw).not.toContain(PHONE);
    expect(raw).not.toContain(PHONE.slice(4));
  });

  it('pseudonymise l’utilisateur et porte requestId et association sur chaque ligne après les gardes', () => {
    // Avant les gardes (limitation de débit…), seul le requestId est connu.
    const afterGuards = lines.filter(
      (l) => l.requestId === 'req-login-1' && (l.context === 'AuthProbe' || l.msg === 'requête traitée'),
    );
    expect(afterGuards).toHaveLength(3);
    for (const line of afterGuards) {
      expect(line).toMatchObject({ associationId: ASSOCIATION, userRef: pseudonymize(USER, KEY) });
    }
    expect(raw).not.toContain(USER);
  });

  it('écrit une ligne d’accès avec la route gabarit, le statut et la durée, sans corps', () => {
    const access = lines.find((l) => l.requestId === 'req-login-1' && l.msg === 'requête traitée');
    expect(access).toMatchObject({
      service: 'api',
      method: 'POST',
      route: '/api/v1/log-probe/login',
      status: 200,
      durationMs: expect.any(Number) as number,
    });
    expect(access).not.toHaveProperty('body');
  });

  it('une erreur SQL : 500 sans détail, journalisée sans requête, paramètres ni code, avec la corrélation', async () => {
    const res = await call('fail-sql', 'req-sql-1', USER, ASSOCIATION);
    expect(res.status).toBe(500);
    await settle();
    const error = lines.find((l) => l.requestId === 'req-sql-1' && l.msg === 'erreur interne');
    expect(error).toMatchObject({
      level: 'error',
      associationId: ASSOCIATION,
      userRef: pseudonymize(USER, KEY),
      err: { sqlstate: '23505', table: 'one_time_codes', constraint: 'otc_key' },
    });
    expect(raw).not.toContain(OTP);
    expect(raw).not.toContain('insert into');
    expect(raw).not.toContain('Failed query');
    expect(raw).not.toContain(PHONE);
  });

  it('un refus 42501 : 404 pour le client, avertissement corrélé pour l’exploitation', async () => {
    const res = await call('forbidden', 'req-rls-1', USER, ASSOCIATION);
    expect(res.status).toBe(404);
    await settle();
    expect(lines.find((l) => l.requestId === 'req-rls-1' && l.context === 'ProblemFilter')).toMatchObject({
      sqlstate: '42501',
      associationId: ASSOCIATION,
    });
  });

  it('deux requêtes concurrentes de deux associations ne mélangent jamais leurs identités', async () => {
    const [a, b] = await Promise.all([
      call('work?ms=40', 'req-a', USER, ASSOCIATION, 'GET'),
      call('work?ms=15', 'req-b', OTHER_USER, OTHER_ASSOCIATION, 'GET'),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await settle();
    const of = (id: string) => lines.filter((l) => l.requestId === id && (l.context === 'AuthProbe' || l.route));
    expect(of('req-a')).toHaveLength(3);
    expect(of('req-b')).toHaveLength(3);
    for (const line of of('req-a')) {
      expect(line).toMatchObject({ associationId: ASSOCIATION, userRef: pseudonymize(USER, KEY) });
    }
    for (const line of of('req-b')) {
      expect(line).toMatchObject({ associationId: OTHER_ASSOCIATION, userRef: pseudonymize(OTHER_USER, KEY) });
    }
  });

  it('les erreurs d’une connexion Redis ouverte pendant une requête ne portent pas son identité', () => {
    const redis = lines.filter((l) => l.context === 'RedisClient');
    expect(redis.length).toBeGreaterThan(0);
    for (const line of redis) {
      expect(line).not.toHaveProperty('requestId');
      expect(line).not.toHaveProperty('associationId');
      expect(line).not.toHaveProperty('userRef');
    }
  });
});
