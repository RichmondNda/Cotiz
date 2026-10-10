import { register } from 'node:module';
import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { SpanKind } from '@opentelemetry/api';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace-base';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';
import { startTracing, type Tracing } from '../../src/shared/telemetry/tracing.js';

/**
 * Lot 0.6, étape 3 — vérification : une erreur provoquée en local est journalisée avec son requestId et son traceId,
 * et ce traceId est celui de la trace exportée (HTTP → Redis). Le traçage démarre AVANT le chargement de Nest,
 * d'Express et d'ioredis (comme `--import ./dist/telemetry.js` en production) : l'app est importée ensuite.
 */

const config = loadConfig({
  NODE_ENV: 'development',
  DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  LOG_LEVEL: 'info',
  LOG_PRETTY: 'false',
});

describe('traces et erreurs (OpenTelemetry)', () => {
  const exporter = new InMemorySpanExporter();
  const lines: Record<string, unknown>[] = [];
  let tracing: Tracing;
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    register('@opentelemetry/instrumentation/hook.mjs', import.meta.url);
    tracing = startTracing(config, { service: 'api', exporter });
    const { createApp } = await import('../../src/app.js');
    const { createLogger } = await import('../../src/shared/logging/index.js');
    const destination = new Writable({
      write(chunk: Buffer, _encoding, done) {
        for (const line of chunk.toString().split('\n').filter(Boolean)) lines.push(JSON.parse(line) as never);
        done();
      },
    });
    app = await createApp(config, { logger: false }, { logger: createLogger(config, { name: 'api', destination }) });
    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
  });

  afterAll(async () => {
    await app.close();
    await tracing.shutdown();
  });

  it('une erreur provoquée (route de démonstration, développement) est journalisée avec requestId et traceId', async () => {
    const res = await fetch(`${baseUrl}/__debug/error?code=482913`, {
      headers: { 'x-request-id': 'req-trace-1', 'user-agent': 'NavigateurDeTest/1.0' },
    });
    expect(res.status).toBe(500);
    expect(((await res.json()) as { requestId?: string }).requestId).toBe('req-trace-1');
    await new Promise((resolve) => setTimeout(resolve, 100));

    const error = lines.find((l) => l.requestId === 'req-trace-1' && l.msg === 'erreur interne');
    expect(error).toMatchObject({ level: 'error', traceId: expect.stringMatching(/^[0-9a-f]{32}$/) as string });
    expect(error?.traceId).not.toBe('0'.repeat(32));

    // Le même traceId que le span HTTP exporté, qui porte le requestId.
    const server = exporter
      .getFinishedSpans()
      .find((s) => s.kind === SpanKind.SERVER && s.attributes['cotiz.request_id'] === 'req-trace-1');
    expect(server?.spanContext().traceId).toBe(error?.traceId);
    // Exporté nettoyé : ni IP, ni user-agent, ni query string.
    expect(Object.keys(server?.attributes ?? {})).not.toEqual(expect.arrayContaining(['client.address']));
    expect(JSON.stringify(server?.attributes)).not.toMatch(/user_agent|NavigateurDeTest|482913|network\.peer/);
    // La ligne d'accès de la requête est dans la même trace.
    expect(lines.find((l) => l.requestId === 'req-trace-1' && l.msg === 'requête traitée')?.traceId).toBe(
      error?.traceId,
    );
  });

  it('la route de démonstration n’existe pas hors développement', async () => {
    const { createApp } = await import('../../src/app.js');
    const production = await createApp(
      loadConfig({
        NODE_ENV: 'test',
        DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
        REDIS_URL: 'redis://127.0.0.1:1',
        S3_ENDPOINT: 'http://127.0.0.1:1',
      }),
      { logger: false },
    );
    await production.listen(0);
    try {
      expect((await fetch(`${await production.getUrl()}/api/v1/__debug/error`)).status).toBe(404);
    } finally {
      await production.close();
    }
  });
});
