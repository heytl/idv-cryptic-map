import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, copyFile, stat, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { compatibilityCss } from './css.mjs';
import { loadSource } from './source.mjs';
import { imageQuality, prepareImage } from './media-profile.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const here = resolve(root, 'scripts/minitool');
const scratch = resolve(root, '.tmp/minitool');
const out = resolve(root, 'dist/minitool');
// Vite clears this output only after its resolved target has been checked.
if (relative(root, out).replaceAll('\\','/') !== 'dist/minitool') throw Error('Unsafe output directory');
for (const directory of [resolve(root, 'dist'), out]) {
  try {
    if ((await lstat(directory)).isSymbolicLink() || !(await realpath(directory)).startsWith(await realpath(root))) throw Error('Linked output directory');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const require = createRequire(resolve(root, 'apps/web/package.json'));
const git = (...args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\','/')}`, ...args], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const { config, configBytes, configPath, mediaRoot, mediaReferences, publisher, snapshotSha, source } = await loadSource({ root, scratch, git, hash });

const viteRequire = createRequire(require.resolve('vite/package.json'));
const { build: bundle } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const validation = await bundle({ entryPoints: [resolve(root, 'packages/shared/src/map-v4.ts')], bundle: true, platform: 'node', format: 'esm', write: false });
await writeFile(resolve(scratch, 'validate.mjs'), validation.outputFiles[0].contents);
const { isPublicMapConfigV6 } = await import(pathToFileURL(resolve(scratch, 'validate.mjs')).href + '?t=' + Date.now());
const validationConfig = structuredClone(config);
for (const [item, key] of mediaReferences(validationConfig)) item[key] = new URL(item[key], 'https://snapshot.invalid').href;
if (!isPublicMapConfigV6(validationConfig)) throw Error('Public V6 snapshot failed shared validation');
const originalImages = new Set();
for (const [item, key] of mediaReferences(config)) {
  const path = item[key];
  if (!/^\/media\/[a-f0-9]{64}\.webp$/.test(path)) throw Error('Media escapes snapshot: ' + path);
  originalImages.add(path.slice(1));
}
const quality = imageQuality(process.env.MINITOOL_IMAGE_QUALITY);
const sharp = quality === null ? null : require('sharp');
const prepared = new Map();
const pendingImages = [...originalImages]; let imageIndex = 0;
await Promise.all(Array.from({ length: 3 }, async () => {
  while (imageIndex < pendingImages.length) {
    const path = pendingImages[imageIndex++];
    prepared.set(path, await prepareImage(await readFile(resolve(mediaRoot, path)), path, quality, sharp));
  }
}));
for (const [item, key] of mediaReferences(config)) item[key] = './assets/' + prepared.get(item[key].slice(1)).record.path;
const mediaProfile = { quality, resize: false, assets: [...prepared.values()].map(item => item.record).sort((a,b) => a.sourcePath.localeCompare(b.sourcePath)) };
await writeFile(resolve(scratch, 'media-profile.json'), JSON.stringify(mediaProfile, null, 2) + '\n');
const images = new Set(mediaProfile.assets.map(item => item.path));

const { build } = await import(pathToFileURL(require.resolve('vite')).href);
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href);
const inject = (file, name) => `import { ${name} } from ${JSON.stringify(resolve(here, file).replaceAll('\\','/'))};\n`;
function once(code, before, after, id) {
  if (code.split(before).length !== 2) throw Error('Review minitool adapter after source change: ' + id + ': ' + before);
  return code.replace(before, after);
}
const transformed = new Set();
await build({
  configFile: false, root: resolve(root, 'apps/web'), base: './', publicDir: false,
  resolve: { alias: [
    { find: '@idv-map/shared/dynamic', replacement: resolve(root, 'packages/shared/src/dynamic.ts') },
    { find: '@idv-map/shared', replacement: resolve(root, 'packages/shared/src/index.ts') },
    { find: /^vue$/, replacement: require.resolve('vue/dist/vue.runtime.esm-bundler.js') },
  ] },
  define: { __VUE_OPTIONS_API__: true, __VUE_PROD_DEVTOOLS__: false, __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false },
  plugins: [{
    name: 'minitool-adapter', enforce: 'pre',
    resolveId(id) { if (id === 'virtual:minitool-snapshot') return '\0minitool-snapshot'; },
    load(id) { if (id === '\0minitool-snapshot') return 'export default ' + JSON.stringify(config); },
    async transform(code, id) {
      const path = id.replaceAll('\\','/').split('?')[0];
      if (id.includes('?')) return;
      if (path.endsWith('/apps/web/src/data/maps-v2.ts')) {
        transformed.add('snapshot-loader');
        return await readFile(resolve(here, 'data-loader.ts'), 'utf8');
      }
      if (path.endsWith('/apps/web/src/main.ts')) {
        transformed.add('entry');
        return `import ${JSON.stringify(resolve(here,'compat.ts'))};\nimport ${JSON.stringify(resolve(here,'compat.css'))};\n` +
          inject('storage.ts','warmPreferences') + inject('compat.ts','startLayoutFallbacks') + inject('window-layout.ts','initializeWindowLayout') +
          `import './styles/fonts.css'; import './styles/main.css'; import { createApp } from 'vue'; import App from './App.vue'; import { router } from './router';
          import ${JSON.stringify(resolve(here,'window-layout.css'))};
          Promise.race([Promise.all([warmPreferences(), initializeWindowLayout()]), new Promise(resolve => setTimeout(resolve, 350))]).then(() => { createApp(App).use(router).mount('#app'); startLayoutFallbacks(); });`;
      }
      if (path.endsWith('/apps/web/src/router.ts')) {
        transformed.add('router');
        code = code.slice(0, code.indexOf('const tracker =')) + `router.afterEach((to, _from, failure) => { if (!failure && to.name === 'catalog-v2') rememberCatalog(String(to.params.gameMapId), String(to.params.mode), String(to.params.entrance)); });`;
        code = code.replace('import { createVisitTracker } from "./telemetry";', '');
      }
      if (path.endsWith('/apps/web/src/App.vue')) {
        transformed.add('app');
        code = once(code, 'import OfflineCache from "./components/OfflineCache.vue";', '', id);
        code = once(code, '<OfflineCache v-if="route.params.gameMapId" />', '', id);
        // Remove the divider which belonged to the unavailable offline-download action.
        code = code.replace(/<span\s+v-if="route.params.gameMapId"[\s\S]*?<\/span>/, '');
      }
      if (/\/apps\/web\/src\/(catalogPreferences\.ts|composables\/useDensity\.ts)$/.test(path)) {
        transformed.add('preferences:' + path.split('/').pop());
        code = inject('storage.ts', 'preferenceStorage, onPreferencesReady') + code.replaceAll('localStorage.', 'preferenceStorage.');
        if (path.endsWith('useDensity.ts')) code = once(code, 'const compact = ref(readPref());', 'const compact = ref(readPref());\nonPreferencesReady(() => { compact.value = readPref(); });', id);
      }
      if (/\/(FloorSwitchV2|MapViewport)\.vue$/.test(path)) {
        transformed.add('size:' + path.split('/').pop());
        code = once(code, '<script setup lang="ts">', '<script setup lang="ts">\n' + inject('compat.ts', 'SizeObserver'), id).replaceAll('new ResizeObserver(', 'new SizeObserver(');
        code = code.replace(/el\.scrollTo\(\{ left: (.*), behavior: 'auto' \}\)/, 'el.scrollLeft = $1');
      }
      if (path.endsWith('/apps/web/src/views/CatalogV2View.vue')) {
        transformed.add('size:CatalogV2View.vue');
        code = once(code, '<script setup lang="ts">', '<script setup lang="ts">\n' + inject('compat.ts', 'SizeObserver'), id)
          .replaceAll('new ResizeObserver(', 'new SizeObserver(');
        code = once(code, 'new SizeObserver(([entry]) => {', 'new SizeObserver(() => {\n    const entry = { contentRect: { width: group.clientWidth } };', id);
        code = once(code, 'filterMinWidth.value = `${width}px`;', 'filterMinWidth.value = `${Math.min(width, group.clientWidth)}px`;', id);
      }
      if (path.endsWith('/apps/web/src/views/AboutView.vue')) {
        transformed.add('about');
        code = code.replace(/async function copyWebsite\(\) \{[\s\S]*?\n\}/, `function copyWebsite() { const element = document.querySelector('.website-address'); if (!element) return; const range = document.createRange(); range.selectNodeContents(element); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); copyStatus.value = '请长按或选中网址复制。'; }`);
        code = code.replace('"已复制" : "复制"', '"已复制" : "选择"').replace('复制网页地址','选择网页地址');
        code = code.replace('>GitHub Issues<HandbookIcon', '>{{ projectInfo.feedbackUrl }}<HandbookIcon');
        code = code.replace('>GitHub 开源<HandbookIcon', '>{{ projectInfo.repository }}<HandbookIcon');
      }
      if (/\/apps\/web\/src\/.*\.(vue|ts)$/.test(path)) {
        code = code.replaceAll('.replaceAll("-", ".")', '.split("-").join(".")');
        // External navigation has no supported platform equivalent: retain selectable credits/URLs.
        code = code.replace(/<a\b([^>]*?):href="projectInfo\.([^"]+)"([^>]*)>/g, (_all, a, _key, b) => '<span data-mini-external' + (a + b).replace(/target="_blank"|rel="noopener noreferrer"/g, '') + '>');
        if (path.endsWith('/App.vue') || path.endsWith('/AboutView.vue')) code = code.replace(/<\/a\s*>/g, '</span>').replaceAll('.about-page a', '.about-page [data-mini-external]');
      }
      if (path.endsWith('/packages/shared/src/project-info.ts')) code = code.replace('"/static/miniprogram-code.png"', '"./static/miniprogram-code.png"');
      if (path.includes('/packages/shared/src/') && code.includes('structuredClone(')) code = inject('compat.ts', 'cloneJson') + code.replaceAll('structuredClone(', 'cloneJson(');
      return code;
    },
  }, vue()],
  css: { postcss: { plugins: [compatibilityCss()] } },
  build: {
    outDir: out, emptyOutDir: true, target: ['es2017','chrome61'], cssTarget: 'chrome61', assetsInlineLimit: 0,
    modulePreload: false, cssCodeSplit: false, sourcemap: false,
    rollupOptions: {
      input: resolve(root, 'apps/web/src/main.ts'),
      output: { format: 'iife', name: 'CrypticHandbook', inlineDynamicImports: true, entryFileNames: 'app.js', assetFileNames: 'assets/[hash][extname]' },
    },
  },
});
for (const expected of ['snapshot-loader','entry','router','app','about','size:FloorSwitchV2.vue','size:MapViewport.vue','size:CatalogV2View.vue','preferences:catalogPreferences.ts','preferences:useDensity.ts']) {
  if (!transformed.has(expected)) throw Error('Missing minitool adapter: ' + expected);
}
for (const image of prepared.values()) {
  await mkdir(dirname(resolve(out, 'assets', image.record.path)), { recursive: true });
  await writeFile(resolve(out, 'assets', image.record.path), image.bytes);
}
for (const path of ['static/miniprogram-code.png', 'icons/treasure.webp']) {
  await mkdir(dirname(resolve(out, path)), { recursive: true });
  await copyFile(resolve(root, 'apps/web/public', path), resolve(out, path));
}
const { readdir } = await import('node:fs/promises');
const subsetFont = require('subset-font');
const builtText = await readFile(resolve(out, 'app.js'), 'utf8');
const ascii = Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join('');
// These are the only two class-specific font consumers in the existing UI.
const headingText = 'CRYPTIC HANDBOOK';
const remarksText = ascii + config.layouts.map(layout => layout.remarks).join('');
const originalFonts = new Map(await Promise.all(['Cinzel','MaShanZheng','NotoSerifSC'].map(async name =>
  [name, hash(await readFile(resolve(root, `apps/web/src/assets/fonts/${name}-subset.woff2`)))])));
const fontSavings = [];
for (const name of (await readdir(resolve(out, 'assets'))).filter(name => name.endsWith('.woff2'))) {
  const path = resolve(out, 'assets', name), input = await readFile(path);
  const font = [...originalFonts].find(([, digest]) => digest === hash(input))?.[0];
  if (!font) throw Error('Unexpected font; review character coverage');
  const text = font === 'Cinzel' ? headingText : font === 'MaShanZheng' ? remarksText : builtText + ascii;
  const output = await subsetFont(input, text, { targetFormat: 'woff2' });
  await writeFile(path, output);
  fontSavings.push({ font, before: input.length, after: output.length, characters: new Set(text).size });
}
const css = (await readdir(resolve(out, 'assets'))).filter(name => name.endsWith('.css'));
if (css.length !== 1) throw Error('Expected exactly one stylesheet');
await writeFile(resolve(out, 'index.html'), `<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover"><title>加页手记解密手册</title><link rel="stylesheet" href="./assets/${css[0]}"></head><body><div id="app"></div><script src="./app.js"></script></body></html>\n`);
// Audited renderer is DOM/CSS/SVG only; it creates no workers, WASM or game engine.
await writeFile(resolve(out, 'mini_tool.json'), '{"is_high_consumption_scene":false}\n');
const manifest = {
  source, configPath: relative(root, configPath).replaceAll('\\','/'),
  snapshotSha, sourceSha: git('rev-parse','HEAD').toString().trim(), sourceConfigSha256: hash(configBytes),
  staticPublisherSha256: hash(publisher), sourceDataVersion: config.dataVersion, sourceUpdatedAt: config.updatedAt,
  maps: config.gameMaps.length, layouts: config.layouts.length, images: images.size,
  imageBytes: (await Promise.all([...images].map(path => stat(resolve(out,'assets',path))))).reduce((sum,s) => sum+s.size,0),
  transformed: [...transformed].sort(), highConsumption: false,
  fontSavings,
  mediaProfile: { quality, resize: false, manifest: '.tmp/minitool/media-profile.json', reencodedImages: mediaProfile.assets.filter(item => item.reencoded).length,
    sourceBytes: mediaProfile.assets.reduce((sum,item) => sum + item.sourceBytes, 0), outputBytes: mediaProfile.assets.reduce((sum,item) => sum + item.bytes, 0) },
};
await writeFile(resolve(scratch, 'build.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('MINITOOL_BUILD:' + JSON.stringify({ ...manifest, directory: relative(root, out) }));
