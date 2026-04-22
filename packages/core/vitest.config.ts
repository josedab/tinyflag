import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/types.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 85,
        branches: 85,
      },
    },
  },
});
