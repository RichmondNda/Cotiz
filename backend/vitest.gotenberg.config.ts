import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Tests contre un vrai Gotenberg : `pnpm --filter backend test:gotenberg` (GOTENBERG_URL).
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/gotenberg/**/*.test.ts'],
    testTimeout: 120_000,
  },
});
