import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC émet les métadonnées de décorateurs dont l'injection de dépendances de NestJS a besoin.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Vrai clamd : job CI dédié (vitest.clamav.config.ts).
    exclude: ['test/clamav/**', '**/node_modules/**'],
    // Démarrage des conteneurs (premier téléchargement des images compris).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Chaque fichier d'intégration démarre ses conteneurs : 2 fichiers à la fois en local, défaut de vitest en CI.
    maxWorkers: Number(process.env.COTIZ_TEST_WORKERS) || (process.env.CI ? undefined : 2),
  },
});
