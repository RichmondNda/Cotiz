import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Démarrage des conteneurs (premier téléchargement des images compris).
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
