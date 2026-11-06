import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, readdir, rename, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const build = JSON.parse(await readFile(resolve(root, '.tmp/static-build.json')));
const old = process.env.STATIC_PREVIOUS_SITE || resolve(build.work, 'previous-site'), latest = resolve(root, 'site');
const work = resolve(root, '.tmp', `upgrade-${Date.now()}`), host = resolve(work, 'host');
await mkdir(work, { recursive: true });
await cp(old, host, { recursive: true });
const server = spawn(process.execPath, [resolve(root, 'scripts/static/serve.mjs'), host], { env: { ...process.env, STATIC_PREVIEW_PORT: '8797' }, stdio: ['ignore', 'pipe', 'inherit'] });
await once(server.stdout, 'data');
const require = createRequire(resolve(process.env.STATIC_SOURCE_DIR, 'apps/web/package.json'));
const browser = await require('playwright-core').chromium.launch({ ...(process.env.STATIC_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
const report = {};
async function sizes(directory) {
  const names = (await readdir(resolve(directory, 'assets'))).filter(n => /\.(js|css)$/.test(n));
  let total = 0;
  for (const n of names) total += gzipSync(await readFile(resolve(directory, 'assets', n))).length;
  return total;
}
try {
  report.oldJsCssGzip = await sizes(old); report.newJsCssGzip = await sizes(latest);
  report.gzipIncreasePercent = (report.newJsCssGzip / report.oldJsCssGzip - 1) * 100;
  assert(report.gzipIncreasePercent <= 10, 'JS/CSS gzip growth exceeds 10%');
  const context = await browser.newContext();
  await context.route('**/_vercel/insights/**', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8797/', { waitUntil: 'networkidle' });
  await page.locator('.map-card-item').first().waitFor();
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await page.getByRole('button', { name: '下载地图离线包', exact: true }).click();
  await page.getByRole('button', { name: '✓ 已可离线使用 · 复查', exact: true }).waitFor({ timeout: 120000 });
  await cp(latest, resolve(work, 'next'), { recursive: true });
  await rename(host, resolve(work, 'old')); await rename(resolve(work, 'next'), host);
  await page.evaluate(() => new Promise(async (resolve, reject) => {
    navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true });
    try { await (await navigator.serviceWorker.getRegistration()).update(); } catch (error) { reject(error); }
  }));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!performance.getEntriesByType('resource').find(r => r.name.endsWith('/maps-v6.json')));
  await page.goto('http://127.0.0.1:8797/#/maps/phosphorescence-disease/hard/basement-track', { waitUntil: 'networkidle' });
  assert.equal(await page.locator('.map-card-item').count(), 14);
  await page.getByRole('button', { name: '下载地图离线包', exact: true }).click();
  await page.getByRole('button', { name: '✓ 已可离线使用 · 复查', exact: true }).waitFor({ timeout: 120000 });
  await context.setOffline(true); await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('.map-card-item').first().waitFor();
  assert.equal(await page.locator('.map-card-item').count(), 14);
  assert.deepEqual(errors, []);
  report.oldPwaUpgrade = true; report.newMapOfflineAfterUpgrade = true; report.errors = errors;
  await mkdir(resolve('.tmp/static-verification'), { recursive: true });
  await writeFile(resolve('.tmp/static-verification/upgrade-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); server.kill(); }
