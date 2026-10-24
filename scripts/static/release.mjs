// Prepare a complete, reviewable static release. This never pushes or changes the live content service.
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { extractGitArchive, files, inventory, json, mediaReferences, sha256, verifyRelease, write } from './lib.mjs';
import { createPwa } from './pwa.mjs';
import { createVersionDirectory } from './versions.mjs';
import { capture } from './capture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = Object.fromEntries(process.argv.slice(2).map((value, i, all) => {
  if (!value.startsWith('--')) return null;
  if (!all[i + 1] || all[i + 1].startsWith('--')) throw Error(`Missing value: ${value}`);
  return [value.slice(2), all[i + 1]];
}).filter(Boolean));
for (const key of Object.keys(args)) if (!['source-ref', 'source-dir', 'config-url', 'capture-dir', 'archive', 'legacy-ref'].includes(key)) throw Error(`Unknown option: ${key}`);
const archive = args.archive;
if (archive && !/^v[1-9]\d*(?:\.\d+){0,2}$/.test(archive)) throw Error('Archive must be v3, v3.1 or v3.1.0');
if (archive === 'v1') throw Error('v1 is reserved for the original static site');
const endpoint = new URL(args['config-url'] || 'https://idv-map.321666.xyz/maps-v4.json');
if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw Error('Use a public HTTPS config URL without credentials/query/fragment');
const git = (...params) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-c', 'core.quotepath=false', '-c', 'core.autocrlf=false', ...params], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
const sourceSha = git('rev-parse', '--verify', `${args['source-ref'] || 'origin/production'}^{commit}`).toString().trim();
const work = resolve(root, '.tmp', `static-${Date.now()}`);
await mkdir(work, { recursive: true });
const next = resolve(work, 'site');
await mkdir(next);
const currentSite = resolve(root, 'site');
const exists = async path => { try { await stat(path); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } };
if (await exists(resolve(currentSite, 'v1'))) {
  for (const name of new Set((await files(currentSite)).map(path => path.split('/')[0]))) {
    if (/^v[1-9]\d*(?:\.\d+){0,2}$/.test(name)) await cp(resolve(currentSite, name), resolve(next, name), { recursive: true });
  }
} else {
  // Lock the original complete site to a commit, independent of the current latest root.
  const legacyRef = args['legacy-ref'] || 'ba791f63acf3c4d81c3bd57c5641b857ce4ebed4';
  const legacySha = git('rev-parse', '--verify', `${legacyRef}^{commit}`).toString().trim();
  const tar = resolve(work, 'legacy.tar');
  git('archive', '--output', tar, legacySha, 'site');
  const unpack = resolve(work, 'legacy'); await mkdir(unpack);
  await extractGitArchive(tar, unpack);
  await cp(resolve(unpack, 'site'), resolve(next, 'v1'), { recursive: true });
  await write(resolve(next, 'v1/archive.json'), JSON.stringify({ version: 'v1', sourceSha: legacySha, files: await inventory(resolve(unpack, 'site')) }, null, 2) + '\n');
}
if (archive && await exists(resolve(next, archive))) throw Error(`Archive ${archive} already exists. Frozen archives cannot be overwritten; omit --archive to update only the latest root.`);

let source;
if (args['source-dir']) {
  source = resolve(args['source-dir']);
  // Reusing installed dependencies is allowed only when every tracked input matches the locked commit.
  for (const path of ['apps/web', 'packages/shared', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
    const entries = git('ls-tree', '-r', '--name-only', sourceSha, path).toString().trim().split('\n').filter(Boolean);
    for (const entry of entries) {
      if (/\/\.env\.development$/.test(entry)) continue; // Vite production builds never read this file.
      const local = await readFile(resolve(source, entry)), locked = git('show', `${sourceSha}:${entry}`);
      const normalize = bytes => bytes.includes(0) ? bytes : Buffer.from(bytes.toString('utf8').replaceAll('\r\n', '\n'));
      if (sha256(normalize(local)) !== sha256(normalize(locked))) throw Error(`Source directory differs from locked commit: ${entry}`);
    }
  }
} else {
  source = resolve(work, 'source'); await mkdir(source);
  const tar = resolve(work, 'source.tar'); git('archive', '--output', tar, sourceSha);
  await extractGitArchive(tar, source);
  const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', 'web...', 'install', '--frozen-lockfile'], { cwd: source, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw Error('Production dependency installation failed');
}
const require = createRequire(resolve(source, 'apps/web/package.json'));
const vitePath = require.resolve('vite');
const viteRequire = createRequire(vitePath);
const { build: bundle } = await import(pathToFileURL(viteRequire.resolve('esbuild')).href);
const validatorPath = resolve(work, 'validator.mjs');
await bundle({ entryPoints: [resolve(source, 'packages/shared/src/index.ts')], outfile: validatorPath, bundle: true, platform: 'node', format: 'esm' });
const { isPublicMapConfigV4, resolvePublicMediaUrls } = await import(pathToFileURL(validatorPath).href);
console.log(`Locked UI: ${sourceSha}; content: ${endpoint.href}`);
const captureDir = args['capture-dir'] ? resolve(args['capture-dir']) : resolve(work, 'capture');
if (!args['capture-dir']) await capture(endpoint, captureDir);
const captured = await json(resolve(captureDir, 'capture.json'));
if (captured.sourceUrl !== endpoint.href) throw Error('Capture endpoint mismatch');
const originalBytes = await readFile(resolve(captureDir, 'source.json'));
if (sha256(originalBytes) !== captured.configSha256) throw Error('Capture config hash mismatch');
const original = JSON.parse(originalBytes);
if (!isPublicMapConfigV4(resolvePublicMediaUrls(original, endpoint.href))) throw Error('Live config fails the production V4 validator');
const capturedAt = captured.capturedAt;
const publisherSha256 = sha256(JSON.stringify(await inventory(resolve(root, 'scripts/static'))));
const releaseId = sha256(sourceSha + sha256(originalBytes) + publisherSha256).slice(0, 16);
const mediaRoot = resolve(captureDir, 'media');
const urls = [...new Set(mediaReferences(original).map(([item, key]) => new URL(item[key], endpoint).href))];
const mediaIndex = captured.mediaIndex;
for (const asset of mediaIndex) {
  const bytes = await readFile(resolve(captureDir, asset.path));
  if (bytes.length !== asset.bytes || sha256(bytes) !== asset.sha256 || asset.path !== `media/${asset.sha256}.webp`) throw Error('Captured image integrity mismatch');
}
if (urls.length !== mediaIndex.length || urls.some(url => !mediaIndex.some(asset => asset.source === url))) throw Error('Capture does not include every image');
const byUrl = new Map(mediaIndex.map(item => [item.source, item.path]));
const viteCli = resolve(dirname(vitePath), '../../bin/vite.js');
async function build(target, base, version) {
  const result = spawnSync(process.execPath, [viteCli, 'build', '--config', resolve(root, 'scripts/static/vite-static.mjs')], {
    cwd: source, stdio: 'inherit',
    env: { ...process.env, STATIC_SOURCE_DIR: source, STATIC_BASE: base, STATIC_BUILD_DIR: target },
  });
  if (result.status !== 0) throw Error(`UI build failed: ${base}`);
  await cp(mediaRoot, resolve(target, 'media'), { recursive: true });
  const config = structuredClone(original);
  for (const [item, key] of mediaReferences(config)) item[key] = base + byUrl.get(new URL(item[key], endpoint).href);
  // Validate every field and every floor region again after localization.
  const absolute = structuredClone(config);
  for (const [item, key] of mediaReferences(absolute)) item[key] = new URL(item[key], 'https://static.invalid').href;
  if (!isPublicMapConfigV4(absolute)) throw Error('Localized config fails production validator');
  await write(resolve(target, 'maps-v4.json'), JSON.stringify(config, null, 2) + '\n');
  await write(resolve(target, 'source-maps-v4.json'), originalBytes);
  await write(resolve(target, 'media-index.json'), JSON.stringify(mediaIndex, null, 2) + '\n');
  await createPwa(target, base, releaseId);
  const integrity = JSON.stringify(await inventory(target), null, 2) + '\n';
  await write(resolve(target, 'integrity.json'), integrity);
  await write(resolve(target, 'release.json'), JSON.stringify({
    version, base, releaseId, sourceSha, publisherSha256, sourceUrl: endpoint.href, capturedAt,
    sourceConfigSha256: sha256(originalBytes), integritySha256: sha256(integrity),
    schemaVersion: original.schemaVersion, dataVersion: original.dataVersion, updatedAt: original.updatedAt,
    layouts: original.layouts.length, gameMaps: original.gameMaps.length,
    sourceImages: urls.length, uniqueImages: new Set(mediaIndex.map(x => x.path)).size,
  }, null, 2) + '\n');
  return verifyRelease(target);
}
const latestRoot = resolve(work, 'latest');
await build(latestRoot, '/', archive || (await exists(resolve(currentSite, 'release.json')) ? (await json(resolve(currentSite, 'release.json'))).version : 'v3'));
if (archive) await build(resolve(next, archive), `/${archive}/`, archive);
await cp(latestRoot, next, { recursive: true });
await createVersionDirectory(next);
// Validate the entire assembled deployment before replacing any previous files.
const { verifySite } = await import('./verify.mjs');
await verifySite(next);
await write(resolve(root, '.tmp/static-build.json'), JSON.stringify({ source, sourceSha, work }, null, 2));
const previous = resolve(work, 'previous-site');
await rename(currentSite, previous);
try { await rename(next, currentSite); }
catch (error) { await rename(previous, currentSite); throw error; }
console.log(`Prepared ${currentSite}: ${original.layouts.length} layouts, ${urls.length} source images, ${archive || 'latest only'}. Previous site retained at ${previous}`);
