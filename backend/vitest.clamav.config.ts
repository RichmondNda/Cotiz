import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Tests contre un vrai clamd (job CI « Antivirus ») : `pnpm --filter backend test:clamav`.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/clamav/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
