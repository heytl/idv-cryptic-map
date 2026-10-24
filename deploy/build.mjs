import { build } from '../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
await build({ entryPoints: ['workers/index.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'dist/worker.mjs', target: 'node24' });
