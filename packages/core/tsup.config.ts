import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    runtime: 'src/runtime.ts',
    testing: 'src/testing.ts',
    signing: 'src/signing.ts',
    sync: 'src/sync.ts',
    progressive: 'src/progressive-core.ts',
    correlation: 'src/correlation-core.ts',
    governance: 'src/governance.ts',
    webhooks: 'src/webhooks.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: true,
  target: 'es2020',
  outDir: 'dist',
});
