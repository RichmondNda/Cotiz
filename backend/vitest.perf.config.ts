import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Mesures de durée (vérifications de lot) : `pnpm test:perf`, hors de `pnpm verify` (trop sensibles à la charge du
// serveur de développement partagé) ; un seul fichier à la fois, pour ne pas mesurer la charge des autres fichiers.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/perf/**/*.test.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    maxWorkers: 1,
  },
});
