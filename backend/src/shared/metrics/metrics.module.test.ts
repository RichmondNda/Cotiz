import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../config.js';
import { metricsPort } from './metrics.module.js';

const base = {
  DATABASE_URL: 'postgres://x:y@127.0.0.1:1/z',
  REDIS_URL: 'redis://127.0.0.1:1',
  S3_ENDPOINT: 'http://127.0.0.1:1',
};

describe('metricsPort', () => {
  it('port configuré : celui-là, pour chaque processus', () => {
    const config = loadConfig({ ...base, API_METRICS_PORT: '19464', WORKER_METRICS_PORT: '0' });
    expect(metricsPort(config, 'api')).toBe(19464);
    expect(metricsPort(config, 'worker')).toBe(0);
  });

  it('absent sous vitest : désactivé (les tests en parallèle ne se disputent pas 9464 / 9465)', () => {
    const config = loadConfig(base);
    expect(metricsPort(config, 'api')).toBe(0);
    expect(metricsPort(config, 'worker')).toBe(0);
  });

  it('absent hors tests : 9464 pour l’api, 9465 pour le worker', () => {
    const vitest = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const config = loadConfig(base);
      expect(metricsPort(config, 'api')).toBe(9464);
      expect(metricsPort(config, 'worker')).toBe(9465);
    } finally {
      process.env.VITEST = vitest;
    }
  });
});
