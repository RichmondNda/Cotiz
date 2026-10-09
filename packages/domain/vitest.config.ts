import { defineConfig } from 'vitest/config';

// Couverture exigée à 95 % (packages/domain/CLAUDE.md) : le test échoue en dessous.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Tests de propriétés (fast-check, 10 000 cas) : 5 s ne suffisent pas quand `pnpm verify` lance tous les paquets en parallèle.
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test-vectors.ts'],
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
