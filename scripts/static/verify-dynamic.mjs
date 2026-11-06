import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(resolve(process.env.STATIC_SOURCE_DIR, 'apps/web/package.json'));
const { chromium } = require('playwright-core');
const base = process.env.STATIC_TEST_URL || 'http://127.0.0.1:8795';
if (!['127.0.0.1', 'localhost', 'jysj.321666.xyz'].includes(new URL(base).hostname)) throw Error('Unexpected acceptance target');
const config = await (await fetch(base + '/maps-v6.json')).json();
const map = config.gameMaps.find(m => m.id === 'phosphorescence-disease');
assert(map, 'Published phosphorescence map required');
const layouts = config.layouts.filter(l => l.gameMapId === map.id);
const browser = await chromium.launch({ ...(process.env.STATIC_BROWSER_CHANNEL === 'chromium' ? {} : { channel: 'chrome' }), headless: true });
const reports = [];
const shots = resolve('.tmp/static-verification'); await mkdir(shots, { recursive: true });
try {
  for (const width of [320, 390, 1365]) {
    const context = await browser.newContext({ viewport: { width, height: 844 } });
    await context.route('**/_vercel/insights/**', r => r.fulfill({ body: '', contentType: 'application/javascript' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const difficulty = map.difficulties[0], entrance = difficulty.enabledEntrances[0];
    const route = `${base}/#/maps/${map.id}/${difficulty.difficultyId}/${entrance}`;
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.locator('.map-card-item').first().waitFor();
    assert.equal(await page.locator('.map-card-item').count(), layouts.length);
    for (const option of difficulty.entranceFilters[entrance].filterOptions) {
      await page.getByRole('button', { name: option.name, exact: true }).click();
      await page.waitForURL(new RegExp(option.id + '$'));
      assert.equal(await page.locator('.map-card-item').count(), layouts.filter(l => l.entrances.some(e => e.type === entrance && e.filterValue === option.id)).length);
      await page.getByRole('button', { name: /^全部/ }).click();
      await page.waitForURL(route);
    }
    await page.getByRole('button', { name: '下载地图离线包', exact: true }).click();
    await page.getByRole('button', { name: '✓ 已可离线使用 · 复查', exact: true }).waitFor({ timeout: 120000 });
    await page.screenshot({ path: resolve(shots, `phosphorescence-${width}-catalog.png`), fullPage: true });
    await page.locator('.map-card-item').first().click();
    await page.waitForFunction(() => document.querySelector('#main-map-img')?.naturalWidth > 0);
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    for (const floor of difficulty.floors) {
      await page.getByRole('button', { name: floor.name, exact: true }).click();
      await page.waitForURL(new RegExp(floor.id + '$'));
      await page.waitForFunction(() => document.querySelector('#main-map-img')?.naturalWidth > 0);
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: resolve(shots, `phosphorescence-${width}-offline.png`), fullPage: true });
    assert.deepEqual(errors, []);
    reports.push({ width, layouts: layouts.length, filters: true, offlineFloors: difficulty.floors.length, errors });
    await context.close();
  }
  await writeFile(resolve(shots, 'dynamic-report.json'), JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally { await browser.close(); }
