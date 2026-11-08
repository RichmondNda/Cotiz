import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC émet les métadonnées de décorateurs dont l'injection de dépendances de NestJS a besoin.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Vrai clamd : job CI dédié (vitest.clamav.config.ts). Mesures de durée : seules, après (vitest.perf.config.ts).
    exclude: ['test/clamav/**', 'test/gotenberg/**', 'test/perf/**', '**/node_modules/**'],
    // Un PostgreSQL pour toute l'exécution, une base copiée d'un modèle migré par fichier (test/support/shared-postgres.ts).
    globalSetup: ['test/support/global-setup.ts'],
    // Démarrage des conteneurs (premier téléchargement des images compris).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // PostgreSQL partagé, mais Redis et MinIO démarrés par fichier : 4 fichiers à la fois en local, défaut de vitest en CI.
    maxWorkers: Number(process.env.COTIZ_TEST_WORKERS) || (process.env.CI ? undefined : 4),
  },
});
