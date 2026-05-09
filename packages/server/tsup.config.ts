import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/runtime.ts' },
  format: ['esm'],
  target: 'node18',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  banner: { js: '#!/usr/bin/env node' },
});
