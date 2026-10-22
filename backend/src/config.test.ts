import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

const pair = (type: 'ed25519' | 'ed448') => {
  const { privateKey, publicKey } = generateKeyPairSync(type as 'ed25519');
  return {
    JWT_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    JWT_PUBLIC_KEY: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
};
const JWT = pair('ed25519');
const CODES_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const valid = {
  DATABASE_URL: 'postgres://cotiz:secret@localhost:6432/cotiz',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
};

describe('loadConfig', () => {
  it('accepte une configuration complète et applique les valeurs par défaut', () => {
    const config = loadConfig(valid);
    expect(config.API_PORT).toBe(4000);
    expect(config.NODE_ENV).toBe('development');
    expect(config.DATABASE_URL).toBe(valid.DATABASE_URL);
  });

  it('échoue explicitement en nommant chaque variable manquante', () => {
    expect(() => loadConfig({ REDIS_URL: valid.REDIS_URL })).toThrow(/DATABASE_URL[\s\S]*S3_ENDPOINT/);
  });

  it('refuse une URL invalide sans recopier sa valeur dans le message', () => {
    let message = '';
    try {
      loadConfig({ ...valid, DATABASE_URL: 'pas-une-url-secret' });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/DATABASE_URL/);
    expect(message).not.toContain('pas-une-url-secret');
  });

  it('convertit API_PORT en entier', () => {
    expect(loadConfig({ ...valid, API_PORT: '4100' }).API_PORT).toBe(4100);
    expect(() => loadConfig({ ...valid, API_PORT: 'abc' })).toThrow(/API_PORT/);
  });

  it('traces : refuse l’exportateur console en production, exige l’adresse du Collector avec otlp', () => {
    const production = {
      ...valid,
      NODE_ENV: 'production',
      S3_ACCESS_KEY_ID: 'cle',
      S3_SECRET_ACCESS_KEY: 'secret-minio',
      CLAMAV_URL: 'tcp://clamav:3310',
      LOG_PSEUDONYM_KEY: 'cle-de-pseudonymisation-de-production-0001',
      APP_PUBLIC_URL: 'https://app.cotiz.app',
      ...JWT,
      CODES_ENCRYPTION_KEY,
      PLATFORM_DATABASE_URL: 'postgres://cotiz_platform:x@127.0.0.1:5432/cotiz',
    };
    expect(() => loadConfig({ ...production, OTEL_TRACES_EXPORTER: 'console' })).toThrow(/OTEL_TRACES_EXPORTER/);
    expect(loadConfig({ ...valid, OTEL_TRACES_EXPORTER: 'console' }).OTEL_TRACES_EXPORTER).toBe('console');
    expect(() => loadConfig({ ...valid, OTEL_TRACES_EXPORTER: 'otlp' })).toThrow(/OTEL_EXPORTER_OTLP_ENDPOINT/);
  });

  it('exige les identifiants MinIO, clamd, la clé de pseudonymisation et l’adresse du front en production seulement, sans recopier leur valeur', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(
      /S3_ACCESS_KEY_ID : manquante[\s\S]*S3_SECRET_ACCESS_KEY : manquante[\s\S]*CLAMAV_URL : manquante[\s\S]*LOG_PSEUDONYM_KEY : manquante[\s\S]*APP_PUBLIC_URL : manquante[\s\S]*JWT_PRIVATE_KEY : manquante[\s\S]*JWT_PUBLIC_KEY : manquante[\s\S]*CODES_ENCRYPTION_KEY : manquante[\s\S]*PLATFORM_DATABASE_URL : manquante/,
    );
    expect(loadConfig({ ...valid, NODE_ENV: 'development' }).S3_ACCESS_KEY_ID).toBeUndefined();
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      S3_ACCESS_KEY_ID: 'cle',
      S3_SECRET_ACCESS_KEY: 'secret-minio',
      CLAMAV_URL: 'tcp://clamav:3310',
      LOG_PSEUDONYM_KEY: 'cle-de-pseudonymisation-de-production-0001',
      APP_PUBLIC_URL: 'https://app.cotiz.app',
      ...JWT,
      CODES_ENCRYPTION_KEY,
      PLATFORM_DATABASE_URL: 'postgres://cotiz_platform:x@127.0.0.1:5432/cotiz',
    });
    expect(config.S3_REGION).toBe('us-east-1');
    expect(config.S3_PUBLIC_ENDPOINT).toBeUndefined();
  });

  it('clés JWT : paire Ed25519 complète et cohérente, `\\n` littéral accepté, jamais recopiées dans le message', () => {
    expect(loadConfig({ ...valid, ...JWT }).JWT_PUBLIC_KEY).toBe(JWT.JWT_PUBLIC_KEY);
    const escaped = loadConfig({
      ...valid,
      JWT_PRIVATE_KEY: JWT.JWT_PRIVATE_KEY.replaceAll('\n', '\\n'),
      JWT_PUBLIC_KEY: JWT.JWT_PUBLIC_KEY.replaceAll('\n', '\\n'),
    });
    expect(escaped.JWT_PRIVATE_KEY).toBe(JWT.JWT_PRIVATE_KEY);

    expect(() => loadConfig({ ...valid, JWT_PRIVATE_KEY: JWT.JWT_PRIVATE_KEY })).toThrow(/JWT_PUBLIC_KEY : manquante/);
    const other = pair('ed25519');
    const ed448 = pair('ed448');
    for (const keys of [
      { ...JWT, JWT_PUBLIC_KEY: other.JWT_PUBLIC_KEY },
      ed448,
      { JWT_PRIVATE_KEY: 'pas une clé', JWT_PUBLIC_KEY: JWT.JWT_PUBLIC_KEY },
    ]) {
      let message = '';
      try {
        loadConfig({ ...valid, ...keys });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/JWT_PRIVATE_KEY : invalide/);
      expect(message).not.toContain('PRIVATE KEY');
    }
  });

  it('PLATFORM_ALLOWED_IPS : refusée si une entrée est invalide', () => {
    expect(loadConfig({ ...valid, PLATFORM_ALLOWED_IPS: '10.0.0.0/8, 203.0.113.7' }).PLATFORM_ALLOWED_IPS).toBe(
      '10.0.0.0/8, 203.0.113.7',
    );
    expect(() => loadConfig({ ...valid, PLATFORM_ALLOWED_IPS: '10.0.0.0/8, bureau' })).toThrow(
      /PLATFORM_ALLOWED_IPS : invalide/,
    );
  });

  it('CODES_ENCRYPTION_KEY : 32 octets en base64, jamais recopiée dans le message', () => {
    expect(loadConfig({ ...valid, CODES_ENCRYPTION_KEY }).CODES_ENCRYPTION_KEY).toBe(CODES_ENCRYPTION_KEY);
    for (const key of [Buffer.alloc(16, 7).toString('base64'), 'pas-du-base64-secret!!']) {
      let message = '';
      try {
        loadConfig({ ...valid, CODES_ENCRYPTION_KEY: key });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toMatch(/CODES_ENCRYPTION_KEY : invalide/);
      expect(message).not.toContain(key);
    }
  });
});
