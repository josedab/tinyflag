import { defineConfig } from 'tsup';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/runtime.ts',
    'src/testing.ts',
    'src/signing.ts',
    'src/sync.ts',
    'src/progressive.ts',
    'src/correlation.ts',
    'src/governance.ts',
    'src/webhooks.ts',
  ],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  target: 'es2020',
  outDir: 'dist',
});
