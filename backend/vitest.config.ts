import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // SWC émet les métadonnées de décorateurs dont l'injection de dépendances de NestJS a besoin.
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Démarrage des conteneurs (premier téléchargement des images compris).
    hookTimeout: 180_000,
    testTimeout: 30_000,
  },
});
