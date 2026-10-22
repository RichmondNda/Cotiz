import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Démarrage des conteneurs (premier téléchargement des images compris).
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Chaque fichier démarre son conteneur PostgreSQL : 2 fichiers à la fois en local, défaut de vitest en CI.
    maxWorkers: Number(process.env.COTIZ_TEST_WORKERS) || (process.env.CI ? undefined : 2),
  },
});
