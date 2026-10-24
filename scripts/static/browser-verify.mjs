import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const source = process.env.STATIC_SOURCE_DIR;
if (!source) throw Error('Set STATIC_SOURCE_DIR to the installed production source checkout');
const require = createRequire(resolve(source, 'apps/web/package.json'));
const { chromium } = require('playwright-core');
const base = process.env.STATIC_TEST_URL || 'http://127.0.0.1:8795';
const origin = new URL(base).origin;
if (!['localhost', '127.0.0.1', 'jysj.321666.xyz'].includes(new URL(base).hostname)) throw Error('Unexpected acceptance target');
const shots = resolve('.tmp/static-verification'); await mkdir(shots, { recursive: true });
const options = { headless: true };
if (process.env.STATIC_BROWSER_CHANNEL !== 'chromium') options.channel = process.env.STATIC_BROWSER_CHANNEL || 'chrome';
const browser = await chromium.launch(options);
const reports = [];
const config = await (await fetch(base + '/maps-v4.json')).json();
const catalog = await (await fetch(base + '/versions/index.json')).json();
const prefixes = ['/', ...catalog.versions.filter(version => version.version !== 'v1').map(version => version.url)];
const offlinePrefixes = ['/', prefixes.find(prefix => prefix === `/${catalog.latest.version}/`) || prefixes[1]];
const imageLoaded = page => page.waitForFunction(() => {
  const image = document.querySelector('#main-map-img');
  return image?.complete && image.naturalWidth > 0;
});
async function loadThumbnails(page) {
  for (const image of await page.locator('.map-card-item img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate(img => img.decode());
  }
  await page.evaluate(() => scrollTo(0, 0));
}
const routeFor = (layout, entrance = layout.entrances[0].type, floor = '') => `#/maps/${layout.gameMapId}/${layout.mode}/${entrance}/layout/${layout.id}${floor ? '/' + floor : ''}`;
try {
  // Decode every actual published image, including assets not visible in the default filter.
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage(); await page.goto(base + '/versions/');
  const index = await (await fetch(base + '/media-index.json')).json();
  const decoded = await page.evaluate(async paths => {
    let index = 0; const results = [];
    await Promise.all(Array.from({ length: 5 }, async () => {
      while (index < paths.length) {
        const src = paths[index++], img = new Image(); img.src = '/' + src;
        await img.decode(); results.push({ path: src, width: img.naturalWidth, height: img.naturalHeight });
      }
    })); return results;
  }, [...new Set(index.map(x => x.path))]);
  assert(decoded.every(x => x.width > 0 && x.height > 0));
  reports.push({ allUniqueImagesDecoded: decoded.length });
  await context.close();
  for (const prefix of prefixes) {
    const localConfig = await (await fetch(base + prefix + 'maps-v4.json')).json();
    for (const mobile of [false, true]) {
      const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 }, isMobile: mobile, hasTouch: mobile, serviceWorkers: 'allow' });
      // Third-party analytics is unrelated to the archived UI and may be unavailable locally.
      await context.route('**/_vercel/insights/**', route => route.fulfill({ status: 200, body: '', contentType: 'application/javascript' }));
      const page = await context.newPage(); const errors = [], failed = [], remoteRuntime = [], writes = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => { if (response.url().startsWith(origin) && response.status() >= 400) failed.push([response.status(), response.url()]); });
      page.on('request', request => {
        if (request.method() !== 'GET') writes.push(request.url());
        if (new URL(request.url()).origin !== origin) remoteRuntime.push(request.url());
      });
      await page.goto(base + prefix, { waitUntil: 'networkidle' });
      await page.locator('.map-card-item').first().waitFor();
      assert(await page.getByRole('link', { name: '历史版本', exact: true }).count());
      await page.locator('.condition-summary').click(); await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: '关闭条件选择', exact: true }).click();
      await loadThumbnails(page);
      await page.screenshot({ path: resolve(shots, `${prefix === '/' ? 'latest' : 'v3'}-${mobile ? 'mobile' : 'desktop'}-catalog.png`), fullPage: true });
      // Every layout and available floor must render, rather than checking one representative card.
      let renderedFloors = 0, renderedEntrances = 0;
      for (const layout of localConfig.layouts) {
        for (const entrance of layout.entrances) {
          await page.goto(base + prefix + routeFor(layout, entrance.type));
          await imageLoaded(page); renderedEntrances++;
        }
        const floors = new Set([...Object.keys(layout.floorImages), ...Object.keys(layout.floorRegions?.regions || {})]);
        for (const floor of floors) {
          await page.goto(base + prefix + routeFor(layout, layout.entrances[0].type, floor));
          await imageLoaded(page); renderedFloors++;
        }
      }
      const first = localConfig.layouts[0];
      await page.goto(base + prefix + routeFor(first)); await imageLoaded(page);
      if (await page.getByRole('button', { name: '一楼', exact: true }).count()) {
        await page.getByRole('button', { name: '一楼', exact: true }).click();
        await page.waitForURL(/floor1$/); await imageLoaded(page);
      }
      await page.screenshot({ path: resolve(shots, `${prefix === '/' ? 'latest' : 'v3'}-${mobile ? 'mobile' : 'desktop'}-detail.png`), fullPage: true });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.reload({ waitUntil: 'networkidle' }); await imageLoaded(page);
      await page.goto(base + prefix + '#/about'); await page.getByRole('heading').first().waitFor();
      await page.goto(base + prefix + '#/changelog'); await page.getByRole('heading').first().waitFor();
      assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(remoteRuntime, []); assert.deepEqual(writes, []);
      reports.push({ prefix, viewport: mobile ? 'mobile' : 'desktop', layouts: localConfig.layouts.length, renderedEntrances, renderedFloors, filterDialog: true, reload: true, aboutAndChangelog: true, errors, failed, remoteRuntime, writes });
      await context.close();
    }
  }
  // Old UI is exercised independently; original bytes are checked by verify.mjs.
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1365, height: 900 }, serviceWorkers: 'block' });
    await context.route('https://fonts.googleapis.com/**', route => route.fulfill({ body: '', contentType: 'text/css' }));
    await context.route('**/_vercel/insights/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/v1/'); await page.locator('.map-card-item').first().waitFor();
    const cards = await page.locator('.map-card-item').count();
    await loadThumbnails(page);
    await page.screenshot({ path: resolve(shots, `v1-${mobile ? 'mobile' : 'desktop'}-catalog.png`), fullPage: true });
    await page.locator('.map-card-item').first().click(); await imageLoaded(page);
    await page.locator('[data-floor="1"]').click(); await imageLoaded(page);
    await page.locator('[data-floor="2"]').click(); await imageLoaded(page);
    await page.reload(); await imageLoaded(page);
    await page.screenshot({ path: resolve(shots, `v1-${mobile ? 'mobile' : 'desktop'}-detail.png`), fullPage: true });
    assert.deepEqual(errors, []); reports.push({ prefix: '/v1/', viewport: mobile ? 'mobile' : 'desktop', cards, floorSwitching: true, deepLinkReload: true, errors });
    await context.close();
  }
  // One browser profile switches versions, downloads packages and survives a full offline reload.
  const context2 = await browser.newContext();
  await context2.route('**/_vercel/insights/**', route => route.fulfill({ body: '', contentType: 'application/javascript' }));
  const page2 = await context2.newPage();
  for (const prefix of offlinePrefixes) {
    await page2.goto(base + prefix, { waitUntil: 'networkidle' });
    await page2.waitForFunction(async prefix => (await navigator.serviceWorker.getRegistrations()).some(registration => new URL(registration.scope).pathname === prefix && registration.active), prefix, { timeout: 20000 });
    await page2.getByRole('button', { name: '下载地图离线包', exact: true }).click();
    await page2.getByRole('button', { name: '✓ 已可离线使用 · 复查', exact: true }).waitFor({ timeout: 120000 });
    await page2.locator('.map-card-item').first().click(); await imageLoaded(page2);
    await context2.setOffline(true); await page2.reload({ waitUntil: 'domcontentloaded' }); await imageLoaded(page2);
    await page2.getByRole('button', { name: '二楼', exact: true }).click(); await page2.waitForURL(/floor2$/); await imageLoaded(page2);
    await context2.setOffline(false);
  }
  const scopes = await page2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(x => new URL(x.scope).pathname));
  assert(offlinePrefixes.every(prefix => scopes.includes(prefix)));
  await page2.goto(base + '/v1/'); await page2.locator('.map-card-item').first().waitFor();
  await page2.goto(base + '/versions/'); await page2.getByRole('heading', { name: '历史版本', exact: true }).waitFor();
  assert((await page2.getByRole('link', { name: 'v1 · 经典旧版', exact: true }).getAttribute('href')) === '/v1/');
  reports.push({ offlineReloadAndFloorSwitch: offlinePrefixes, firstVisitPackageWithoutOnlineReload: true, isolatedWorkerScopes: scopes, oldVersionAfterNewWorker: true, versionDirectory: true });
  await context2.close();
  await writeFile(resolve(shots, 'report.json'), JSON.stringify({ target: base, verifiedAt: new Date().toISOString(), reports }, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
