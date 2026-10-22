import { generateKeyPairSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { loadConfig } from '../../config.js';

const jwt = generateKeyPairSync('ed25519');

// Page de documentation interne (Scalar), servie par l'api en développement uniquement, sans aucune ressource externe.
const env = (NODE_ENV: string) => ({
  NODE_ENV,
  DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  // Exigées en production (config.ts) ; jamais utilisées ici.
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  CLAMAV_URL: 'tcp://127.0.0.1:1',
  LOG_PSEUDONYM_KEY: 'cle-de-test-pseudonymisation-0123456789',
  APP_PUBLIC_URL: 'https://app.cotiz.test',
  JWT_PRIVATE_KEY: jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  JWT_PUBLIC_KEY: jwt.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  CODES_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  PLATFORM_DATABASE_URL: 'postgres://cotiz_platform:cotiz@127.0.0.1:1/cotiz',
});

let app: INestApplication | undefined;
async function start(nodeEnv: string): Promise<string> {
  app = await createApp(loadConfig(env(nodeEnv)), { logger: false });
  await app.listen(0);
  return `${await app.getUrl()}/api/v1`;
}
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('documentation de l’API (dev)', () => {
  it('sert la page, le script Scalar local et openapi.json, avec une CSP limitée au même site', async () => {
    const base = await start('development');
    const page = await fetch(`${base}/docs`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    const csp = page.headers.get('content-security-policy') ?? '';
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("connect-src 'self'");
    expect(csp).not.toMatch(/https?:/);
    const html = await page.text();
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).toContain('src="/api/v1/docs/scalar.js"');
    // `#api-reference` serait monté vide par le script autonome de Scalar.
    expect(html).not.toContain('id="api-reference"');

    const script = await fetch(`${base}/docs/scalar.js`);
    expect(script.status).toBe(200);
    expect(script.headers.get('content-type')).toContain('javascript');
    const bundle = await script.text();
    expect(bundle.length).toBeGreaterThan(100_000);
    expect(bundle).not.toContain('fonts.scalar.com');

    const init = await (await fetch(`${base}/docs/init.js`)).text();
    expect(init).toContain('withDefaultFonts: false');
    expect(init).toContain('telemetry: false');
    expect(init).toContain('agent: { disabled: true }');

    const spec = await fetch(`${base}/docs/openapi.json`);
    expect(spec.status).toBe(200);
    const doc = (await spec.json()) as { openapi: string; paths: Record<string, unknown> };
    expect(doc.openapi).toBe('3.1.0');
    expect(Object.keys(doc.paths)).toContain('/api/v1/health/live');
  });

  it('absente en production (404)', async () => {
    const base = await start('production');
    expect((await fetch(`${base}/docs`)).status).toBe(404);
    expect((await fetch(`${base}/docs/openapi.json`)).status).toBe(404);
  });
});
