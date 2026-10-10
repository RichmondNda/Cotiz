import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { runWithRequestInfo } from '../request-info/index.js';
import { runWithLogContext, setLogIdentity } from './log-context.js';
import { createLogger } from './logger.js';
import { PinoNestLogger } from './nest-logger.js';
import { pseudonymize } from './pseudonym.js';
import { MASKED } from './redaction.js';

const KEY = 'cle-de-test-pseudonymisation-0123456789';
const config = loadConfig({
  DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  LOG_LEVEL: 'debug',
  LOG_PRETTY: 'false',
  LOG_PSEUDONYM_KEY: KEY,
});

/** Journal capturé ligne par ligne (JSON). */
function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as never);
      done();
    },
  });
  return { lines, logger: createLogger(config, { name: 'api', destination: stream }) };
}

const USER = '00000000-0000-7000-8000-0000000a0001';
const ASSOCIATION = '00000000-0000-7000-8000-0000000ab001';

describe('pseudonymize', () => {
  it('est stable pour une clé et change avec la clé, sans laisser l’identifiant', () => {
    const ref = pseudonymize(USER, KEY);
    expect(ref).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudonymize(USER, KEY)).toBe(ref);
    expect(pseudonymize(USER, `${KEY}-autre`)).not.toBe(ref);
    expect(ref).not.toContain(USER.slice(0, 8));
  });
});

describe('createLogger', () => {
  it('ajoute requestId, associationId et l’utilisateur pseudonymisé de la requête en cours', () => {
    const { lines, logger } = capture();
    runWithRequestInfo({ requestId: 'req-1', ip: null, userAgent: null }, () => {
      runWithLogContext({}, () => {
        setLogIdentity({ userId: USER, associationId: ASSOCIATION });
        logger.info('dans la requête');
      });
    });
    logger.info('hors requête');
    expect(lines[0]).toMatchObject({
      level: 'info',
      service: 'api',
      msg: 'dans la requête',
      requestId: 'req-1',
      associationId: ASSOCIATION,
      userRef: pseudonymize(USER, KEY),
    });
    expect(JSON.stringify(lines[0])).not.toContain(USER);
    expect(lines[1]).not.toHaveProperty('requestId');
    expect(lines[1]).not.toHaveProperty('userRef');
  });

  it('la corrélation l’emporte sur un champ homonyme de l’objet journalisé', () => {
    const { lines, logger } = capture();
    runWithLogContext({}, () => {
      setLogIdentity({ userId: USER, associationId: ASSOCIATION });
      logger.info({ associationId: 'autre', userRef: 'forge', userId: USER }, 'objet imprudent');
    });
    expect(lines[0]).toMatchObject({ associationId: ASSOCIATION, userRef: pseudonymize(USER, KEY) });
    expect(JSON.stringify(lines[0])).not.toContain(USER);
  });

  it('une nouvelle identité remplace entièrement la précédente', () => {
    const { lines, logger } = capture();
    runWithLogContext({}, () => {
      setLogIdentity({ userId: USER, associationId: ASSOCIATION });
      setLogIdentity({ userId: USER });
      logger.info('espace sans association');
    });
    expect(lines[0]).not.toHaveProperty('associationId');
  });

  it('ajoute le contexte d’une tâche du worker', () => {
    const { lines, logger } = capture();
    runWithLogContext({ queue: 'events', jobId: 'event-12', associationId: ASSOCIATION }, () => {
      logger.warn('échec');
    });
    expect(lines[0]).toMatchObject({ level: 'warn', queue: 'events', jobId: 'event-12', associationId: ASSOCIATION });
  });

  it('masque les champs sensibles et les téléphones, dans les objets comme dans les messages', () => {
    const { lines, logger } = capture();
    logger.info({ body: { phone: '+2250707070707', password: 'S3cret!' } }, 'connexion du +225 07 07 07 07 07');
    const raw = JSON.stringify(lines[0]);
    expect(raw).not.toContain('S3cret!');
    expect(raw).not.toMatch(/0707070707|07 07 07 07 07/);
    expect(lines[0]).toMatchObject({ body: { phone: MASKED, password: MASKED }, msg: `connexion du ${MASKED}` });
  });

  it('sérialise une erreur sans son message SQL', () => {
    const { lines, logger } = capture();
    const pg = Object.assign(new Error('violates ... (+2250707070707)'), { code: '23505' });
    logger.error({ err: new Error('Failed query: params: +2250707070707', { cause: pg }) }, 'erreur interne');
    expect(JSON.stringify(lines[0])).not.toContain('2250707070707');
    expect(lines[0]).toMatchObject({ err: { type: 'Error', sqlstate: '23505' } });
  });

  it('Logger.error(message, pile) sans contexte : la pile est réduite à ses cadres, jamais prise pour le contexte', () => {
    const { lines, logger } = capture();
    const stack =
      'Error: Failed query: insert ... params: 482913\n    at run (src/x.ts:1:1)\n    at main (src/y.ts:2:2)';
    new PinoNestLogger(logger).error('échec', stack);
    expect(lines[0]).toMatchObject({
      level: 'error',
      msg: 'échec',
      stack: ['    at run (src/x.ts:1:1)', '    at main (src/y.ts:2:2)'],
    });
    expect(lines[0]).not.toHaveProperty('context');
    expect(JSON.stringify(lines[0])).not.toContain('482913');
  });
});
