// Bundles the extension entry points into laugh/dist/.
//
// Content scripts cannot be ES modules in MV3, so marker.js is emitted as an IIFE.
// The service worker is declared "type": "module", so it stays ESM.

import { build } from 'esbuild';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const outdir = resolve(root, 'dist');

const watch = process.argv.includes('--watch');

const ENTRIES = [
  { entry: 'ext/service_worker.ts', out: 'service_worker', format: 'esm' },
  { entry: 'ext/content/marker.ts', out: 'marker', format: 'iife' },
  { entry: 'feed/feed.ts', out: 'feed', format: 'esm' },
  { entry: 'popup/popup.ts', out: 'popup', format: 'esm' },
  { entry: 'options/options.ts', out: 'options', format: 'esm' },
];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

const contexts = await Promise.all(
  ENTRIES.map(({ entry, out, format }) =>
    build({
      entryPoints: [resolve(root, entry)],
      outfile: resolve(outdir, `${out}.js`),
      bundle: true,
      format,
      target: 'chrome114',
      platform: 'browser',
      sourcemap: watch ? 'inline' : false,
      minify: !watch,
      logLevel: 'info',
    }),
  ),
);

console.log(`laugh: built ${contexts.length} bundles into ${outdir}`);
