import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'es2020',
  outDir: 'dist',
  external: ['tinyflag', '@opentelemetry/api'],
});
