import { createHash } from 'node:crypto';

/**
 * Identifiant des données de développement : le même que les données simulées du front (frontend/server/mocks/ids.ts,
 * `uid(type, clé)`), pour que routes, scripts de capture et parcours e2e retrouvent les mêmes lignes en réel.
 */
export function mockId(kind: string, key: string): string {
  const h = createHash('sha1').update(`cotiz:${kind}:${key}`).digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

export class SeedRefusedError extends Error {
  override readonly name = 'SeedRefusedError';
}

/**
 * Données de développement (seed-dev) : refusées hors développement et test, et sans COTIZ_DEV_SEED=1. Liste blanche :
 * un environnement sans NODE_ENV vaut `development` ; l'accord explicite évite tout lancement par erreur en recette ou
 * en production.
 */
export function assertDevSeedAllowed(config: { NODE_ENV: string; COTIZ_DEV_SEED: boolean }): void {
  if (!['development', 'test'].includes(config.NODE_ENV) || !config.COTIZ_DEV_SEED) {
    throw new SeedRefusedError('données de développement : NODE_ENV development ou test et COTIZ_DEV_SEED=1 exigés');
  }
}
export { CROWD_REVIEWER, type CrowdMember, type CrowdPayment, REFERENCE_CROWD } from './reference-crowd.js';
