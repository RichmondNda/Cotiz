import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Mesures de durée (vérifications de lot) : un seul fichier à la fois, après la suite parallèle (`pnpm test`), pour ne
// pas mesurer la charge des autres fichiers.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/perf/**/*.test.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
    maxWorkers: 1,
  },
});
