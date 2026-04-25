import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { gzipSync } from 'zlib';
import { createRequire } from 'module';
import { build } from 'tsup';

const TARGET_GZIP_BYTES = 8192;
const MAX_GZIP_BYTES = 11264;
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(packageRoot, 'scripts', 'minimal-consumer.ts');
const tempDir = await mkdtemp(join(tmpdir(), 'tinyflag-bundle-'));
const entrypoints = [
  'runtime',
  'signing',
  'sync',
  'progressive',
  'correlation',
  'governance',
  'webhooks',
];

async function bundle(format) {
  const outDir = join(tempDir, format);
  await build({
    config: false,
    entry: [entry],
    format: [format],
    outDir,
    clean: true,
    dts: false,
    minify: true,
    platform: format === 'esm' ? 'browser' : 'node',
    external: format === 'esm' ? ['crypto', 'fs'] : [],
    silent: true,
    sourcemap: false,
    splitting: false,
    target: 'es2020',
  });

  const outputName = (await readdir(outDir)).find((name) =>
    format === 'esm' ? name.endsWith('.js') : name.endsWith('.cjs'),
  );
  if (!outputName) {
    throw new Error(`No ${format.toUpperCase()} consumer bundle was emitted`);
  }

  const output = await readFile(join(outDir, outputName));
  return gzipSync(output).byteLength;
}

try {
  const esmModule = await import(join(packageRoot, 'dist', 'index.js'));
  const cjsModule = createRequire(import.meta.url)(join(packageRoot, 'dist', 'index.cjs'));

  if (typeof esmModule.TinyFlag !== 'function' || typeof cjsModule.TinyFlag !== 'function') {
    throw new Error('TinyFlag is not resolvable from both published module formats');
  }

  for (const entrypoint of entrypoints) {
    await import(join(packageRoot, 'dist', `${entrypoint}.js`));
    createRequire(import.meta.url)(join(packageRoot, 'dist', `${entrypoint}.cjs`));
  }

  const [esmSize, cjsSize] = await Promise.all([bundle('esm'), bundle('cjs')]);
  console.log(`Minimal ESM consumer: ${esmSize} bytes gzipped`);
  console.log(`Minimal CJS consumer: ${cjsSize} bytes gzipped`);

  if (esmSize > TARGET_GZIP_BYTES || cjsSize > TARGET_GZIP_BYTES) {
    console.warn(
      `Bundle remains above the ${TARGET_GZIP_BYTES}-byte target; current regression ceiling is ${MAX_GZIP_BYTES} bytes`,
    );
  }

  if (esmSize > MAX_GZIP_BYTES || cjsSize > MAX_GZIP_BYTES) {
    throw new Error(
      `Minimal consumer exceeds ${MAX_GZIP_BYTES} bytes gzipped (ESM ${esmSize}, CJS ${cjsSize})`,
    );
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
