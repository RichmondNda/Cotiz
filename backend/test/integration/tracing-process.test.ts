import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { freePort } from '../support/free-port.js';

/**
 * Traçage dans un vrai processus, préchargé comme en production (`--import ./src/telemetry.ts`, hook ESM) : sous
 * vitest, les bibliothèques chargées par `import` (ioredis, pg) échappent au hook, pas dans `node`. Exportateur
 * `console` : les spans sont lus sur la sortie standard.
 */
describe('traces de l’api (processus réel, exportateur console)', () => {
  let api: ChildProcess;
  let output = '';
  let baseUrl: string;

  beforeAll(async () => {
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${String(port)}/api/v1`;
    api = spawn(
      process.execPath,
      [
        '--conditions=development',
        '--import',
        '@swc-node/register/esm-register',
        '--import',
        './src/telemetry.ts',
        'src/main.ts',
      ],
      {
        cwd: new URL('../..', import.meta.url),
        env: {
          // Environnement du test sans les variables de vitest (journaux silencieux, métriques désactivées).
          ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('VITEST'))),
          NODE_ENV: 'development',
          LOG_LEVEL: 'info',
          API_PORT: String(port),
          API_METRICS_PORT: '0',
          DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
          REDIS_URL: 'redis://127.0.0.1:1',
          S3_ENDPOINT: 'http://127.0.0.1:1',
          LOG_PRETTY: 'false',
          OTEL_TRACES_EXPORTER: 'console',
        },
      },
    );
    api.stdout?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    api.stderr?.on('data', (chunk: Buffer) => (output += chunk.toString()));
    // Démarrage avec compilation swc : lent quand toute la suite tourne en parallèle. Arrêt du processus : échec immédiat.
    let exited: number | null | undefined;
    api.once('exit', (code) => (exited = code));
    for (let i = 0; i < 1_200 && !output.includes('api prête') && exited === undefined; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(output, `processus arrêté (${String(exited)})`).toContain('api prête');
    await fetch(`${baseUrl}/__debug/error?code=482913`, {
      headers: { 'x-request-id': 'req-process-1', 'user-agent': 'NavigateurDeTest/1.0' },
    });
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }, 150_000);

  afterAll(() => {
    api.kill('SIGTERM');
  });

  /** Ligne de journal JSON de la requête. */
  const logLine = (msg: string) =>
    output
      .split('\n')
      .filter((line) => line.startsWith('{"level"'))
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((line) => line.requestId === 'req-process-1' && line.msg === msg);

  /** Blocs de span écrits par ConsoleSpanExporter (console.dir), avec leur traceId. */
  const spans = () =>
    output
      .split(/\n(?=\{\n)/)
      .filter((block) => block.includes('instrumentationScope'))
      .map((block) => ({ block, traceId: /\n {2}traceId: '([0-9a-f]{32})'/.exec(block)?.[1] }));

  it('l’erreur est journalisée avec requestId et traceId ; HTTP, Express et Redis dans la même trace', () => {
    const error = logLine('erreur interne');
    expect(error?.traceId).toMatch(/^[0-9a-f]{32}$/);
    const ofTrace = spans().filter((s) => s.traceId === error?.traceId);
    const scopes = ofTrace.map((s) => /name: '(@opentelemetry\/instrumentation-[a-z]+)'/.exec(s.block)?.[1]);
    expect(scopes).toEqual(
      expect.arrayContaining([
        '@opentelemetry/instrumentation-http',
        '@opentelemetry/instrumentation-express',
        '@opentelemetry/instrumentation-ioredis',
      ]),
    );
    expect(ofTrace.some((s) => s.block.includes("'cotiz.request_id': 'req-process-1'"))).toBe(true);
  });

  it('les spans HTTP n’exportent ni IP, ni user-agent, ni query string ; route gabarit au lieu du chemin', () => {
    const http = spans().filter((s) => s.block.includes('instrumentation-http'));
    expect(http.length).toBeGreaterThan(0);
    for (const { block } of http) {
      expect(block).not.toMatch(/client\.address|network\.peer\.address|user_agent\.original|NavigateurDeTest|482913/);
    }
    expect(http.some((s) => s.block.includes("'url.path': '/api/v1/__debug/error'"))).toBe(true);
  });

  it('les spans Redis ne portent que le nom de la commande (jamais la clé, qui cite l’IP)', () => {
    const redis = spans().filter((s) => s.block.includes('instrumentation-ioredis'));
    expect(redis.length).toBeGreaterThan(0);
    for (const { block } of redis) expect(block).not.toMatch(/ip:|127\.0\.0\.1 /);
  });
});
