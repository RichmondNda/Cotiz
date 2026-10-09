import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

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

  it('exige les identifiants MinIO en production seulement, sans recopier leur valeur', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(
      /S3_ACCESS_KEY_ID : manquante[\s\S]*S3_SECRET_ACCESS_KEY : manquante/,
    );
    expect(loadConfig({ ...valid, NODE_ENV: 'development' }).S3_ACCESS_KEY_ID).toBeUndefined();
    const config = loadConfig({
      ...valid,
      NODE_ENV: 'production',
      S3_ACCESS_KEY_ID: 'cle',
      S3_SECRET_ACCESS_KEY: 'secret-minio',
    });
    expect(config.S3_REGION).toBe('us-east-1');
    expect(config.S3_PUBLIC_ENDPOINT).toBeUndefined();
  });
});
