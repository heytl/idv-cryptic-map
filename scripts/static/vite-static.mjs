// Build the unmodified production UI with a small, checked static-host adapter.
// No separate copy of Vue components, styles, gestures or map rendering is maintained.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const source = process.env.STATIC_SOURCE_DIR;
const base = process.env.STATIC_BASE;
const scope = base === '/' ? 'latest' : base.replaceAll('/', '');
if (!source || !base) throw Error('Use scripts/static/release.mjs');
const require = createRequire(resolve(source, 'apps/web/package.json'));
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href);
function replaceOnce(code, before, after, id) {
  if (code.split(before).length !== 2) throw Error(`Static adapter requires review after source change: ${id}: ${before}`);
  return code.replace(before, after);
}
export default {
  root: resolve(source, 'apps/web'),
  base,
  resolve: { alias: { '@idv-map/shared': resolve(source, 'packages/shared/src/index.ts') } },
  define: { 'import.meta.env.VITE_MAP_API_BASE_URL': JSON.stringify(base) },
  plugins: [
    {
      name: 'static-host-adapter', enforce: 'pre',
      transform(code, id) {
        const path = id.replaceAll('\\', '/');
        if (path.endsWith('/packages/shared/src/map-client.ts')) {
          // Frozen JSON contains same-origin URLs beneath this release's base.
          code = replaceOnce(code, '/^\\/r2\\/[^\\\\\\s]+$/', '/^\\/(?!\\/)[^\\\\\\s]+$/', id);
        }
        if (path.endsWith('/src/composables/useOfflineCache.ts')) {
          for (const name of ['maps-config-v4', 'map-images-r2']) code = code.replaceAll(`"${name}"`, `"static-${scope}-${name}"`);
          code = code.replaceAll('idv_map_offline_v4_', `idv_static_${scope}_offline_v4_`);
        }
        if (path.endsWith('/src/main.ts')) code = replaceOnce(code, 'void retireLegacyCaches();', '// Historical versions own their caches; never retire another version.', id);
        if (path.endsWith('/src/App.vue')) code = replaceOnce(code,
          '<RouterLink to="/about" class="footer-link">关于手册</RouterLink>',
          '<RouterLink to="/about" class="footer-link">关于手册</RouterLink><span aria-hidden="true"> · </span><a href="/versions/" class="footer-link">历史版本</a>', id);
        return code;
      },
      transformIndexHtml: {
        order: 'pre', handler(html) {
          html = replaceOnce(html, '<script defer src="/registerSW.js"></script>', `<script defer src="${base}registerSW.js"></script>`, 'index.html');
          return html.replace('</head>', `<link rel="manifest" href="${base}manifest.webmanifest"><meta name="theme-color" content="#1a1410"></head>`);
        },
      },
    },
    vue(),
  ],
  build: {
    outDir: process.env.STATIC_BUILD_DIR, emptyOutDir: true, assetsInlineLimit: 0,
    rollupOptions: { output: { assetFileNames: 'assets/[hash][extname]' } },
  },
};
