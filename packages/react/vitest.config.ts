import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 90,
        branches: 85,
      },
    },
  },
});
