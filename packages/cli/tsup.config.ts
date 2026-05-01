import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: false,
    clean: true,
    target: 'es2020',
    outDir: 'dist',
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: ['src/lib.ts'],
    format: ['esm'],
    dts: true,
    clean: false,
    target: 'es2020',
    outDir: 'dist',
  },
]);
