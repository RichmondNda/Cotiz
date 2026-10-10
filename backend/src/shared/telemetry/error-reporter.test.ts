import { createTransport, getClient } from '@sentry/node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../config.js';
import { runWithRequestInfo } from '../request-info/index.js';
import { ErrorReporter } from './error-reporter.js';

const base = {
  DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
};

/** Transport Sentry de test : enregistre les enveloppes au lieu de les envoyer. */
function recordingTransport() {
  const sent: string[] = [];
  const factory = vi.fn((options: Parameters<typeof createTransport>[0]) =>
    createTransport(options, (request) => {
      sent.push(typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body));
      return Promise.resolve({ statusCode: 200 });
    }),
  );
  return { sent, factory };
}

describe('ErrorReporter (GlitchTip)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // En premier : aucun SDK initialisé dans ce fichier avant ce test.
  it('sans DSN : inactif, aucun SDK initialisé, aucun envoi', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { factory } = recordingTransport();
    const reporter = new ErrorReporter(loadConfig(base), { transport: factory });
    expect(reporter.enabled).toBe(false);
    expect(reporter.capture(new Error('boum'))).toBeUndefined();
    await reporter.flush();
    expect(factory).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    // Aucun client Sentry : rien ne peut partir, par aucun transport (le transport Node passe par http, pas fetch).
    expect(getClient()).toBeUndefined();
  });

  it('avec DSN : envoie version, requestId et traceId, sans message SQL ni donnée personnelle', async () => {
    const { sent, factory } = recordingTransport();
    const reporter = new ErrorReporter(
      loadConfig({ ...base, GLITCHTIP_DSN: 'http://cle@127.0.0.1:1/1', APP_VERSION: '1.2.3' }),
      { transport: factory, service: 'api' },
    );
    expect(reporter.enabled).toBe(true);
    const pg = Object.assign(new Error('duplicate key (+2250707070707)'), { code: '23505', table: 'users' });
    const drizzle = Object.assign(new Error('Failed query: insert ... params: 482913', { cause: pg }), {
      query: 'insert into users',
      params: ['482913'],
    });
    runWithRequestInfo({ requestId: 'req-ge-1', ip: '10.0.0.7', userAgent: 'Mozilla' }, () => {
      expect(reporter.capture(drizzle)).toMatch(/^[0-9a-f]{32}$/);
    });
    await reporter.flush();
    expect(factory).toHaveBeenCalledTimes(1);
    const envelope = sent.join('\n');
    expect(envelope).toContain('"release":"1.2.3"');
    expect(envelope).toContain('"requestId":"req-ge-1"');
    expect(envelope).toContain('"sqlstate":"23505"');
    for (const secret of ['482913', '2250707070707', 'Failed query', 'insert into', '10.0.0.7', 'Mozilla']) {
      expect(envelope).not.toContain(secret);
    }
  });
});
