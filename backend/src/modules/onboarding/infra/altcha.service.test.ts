import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { AltchaService } from './altcha.service.js';

const base = {
  DATABASE_URL: 'postgres://cotiz:secret@localhost:6432/cotiz',
  REDIS_URL: 'redis://localhost:6379',
  S3_ENDPOINT: 'http://localhost:9000',
  ALTCHA_COST: '1',
};

describe('AltchaService : compteur du défi', () => {
  it('par défaut, compteur tiré entre 5 000 et 10 000 (difficulté pour le navigateur)', () => {
    expect(loadConfig(base).ALTCHA_COUNTER_MAX).toBe(10_000);
  });

  it('ALTCHA_COUNTER_MAX borne le compteur, tiré dans [max/2 ; max]', async () => {
    const service = new AltchaService(loadConfig({ ...base, ALTCHA_COUNTER_MAX: '20' }));
    for (let i = 0; i < 5; i += 1) {
      const solution = await solveChallenge({ challenge: await service.create(), deriveKey });
      expect(solution?.counter).toBeGreaterThanOrEqual(10);
      expect(solution?.counter).toBeLessThanOrEqual(20);
    }
  });

  it('refuse un maximum inférieur à 2 (un compteur nul résoudrait le défi sans travail)', () => {
    expect(() => loadConfig({ ...base, ALTCHA_COUNTER_MAX: '1' })).toThrow(/ALTCHA_COUNTER_MAX/);
  });
});
