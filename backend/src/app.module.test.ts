import { generateKeyPairSync } from 'node:crypto';
import type { CanActivate } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

const jwt = generateKeyPairSync('ed25519');
const production = loadConfig({
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
  S3_ACCESS_KEY_ID: 'test',
  S3_SECRET_ACCESS_KEY: 'test',
  CLAMAV_URL: 'tcp://127.0.0.1:1',
  LOG_PSEUDONYM_KEY: 'cle-de-test-pseudonymisation-0123456789',
  APP_PUBLIC_URL: 'https://app.cotiz.test',
  JWT_PRIVATE_KEY: jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  JWT_PUBLIC_KEY: jwt.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  LOG_LEVEL: 'silent',
});

class OpenGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

describe('AppModule.register', () => {
  it('refuse de remplacer la chaîne des gardes en production', () => {
    expect(() => AppModule.register(production, { guards: [OpenGuard] })).toThrow(/tests/);
    expect(() => AppModule.register(production)).not.toThrow();
  });
});
