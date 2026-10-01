// Local fixtures only. Includes trusted touch events via Chrome DevTools Protocol.
import { chromium } from 'playwright-core';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const base = process.env.TEST_URL || 'http://127.0.0.1:8787';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Use isolated local fixtures');
const original = await (await fetch(`${base}/api/admin/v3/maps`)).json();
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1365, height: 900 }, hasTouch: true, serviceWorkers: 'block' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', dialog => dialog.accept());
const editor = page.locator('.region-editor');
const button = name => editor.getByRole('button', { name, exact: true });
const rectValues = async () => Object.fromEntries(await Promise.all(['x', 'y', 'width', 'height'].map(async key => [key, Number(await editor.locator(`input[aria-label="${key}"]`).inputValue())])));
async function coordinates(r) {
  const details = editor.locator('details');
  if (!await details.evaluate(el => el.open)) await details.locator('summary').click();
  for (const [key, value] of Object.entries(r)) {
    const field = editor.getByRole('spinbutton', { name: key, exact: true });
    await field.fill(String(value)); await field.press('Tab');
  }
}
async function openLayout() {
  await page.goto(`${base}/admin/#layouts`);
  await page.getByRole('button', { name: '编辑', exact: true }).first().click();
}
async function saveLayout() {
  await page.getByRole('button', { name: '应用（还需保存内容）', exact: true }).click();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('已保存', { exact: true }).first().waitFor();
}
await mkdir('.tmp/screenshots', { recursive: true });
try {
  await openLayout();
  const title = await page.locator('.editor-modal .n-card-header__main').innerText();
  const id = Number(title.match(/#(\d+)/)[1]);
  const item = original.layouts.find(l => l.id === id);
  const target = { x: 40, y: 50, width: 650, height: 650 };
  await page.getByRole('button', { name: '选择区域', exact: true }).first().click();
  await button('确认此区域').waitFor();
  await coordinates(target);
  assert.deepEqual(await rectValues(), target);
  await button('放大图片').click(); await button('放大选区').click();
  assert.deepEqual(await rectValues(), target);
  await editor.getByRole('button', { name: '向右微调', exact: true }).click();
  assert.equal((await rectValues()).x, 41);
  await button('撤销').click(); assert.deepEqual(await rectValues(), target);
  await button('重做').click(); assert.equal((await rectValues()).x, 41);
  await button('撤销').click();
  await editor.getByRole('combobox', { name: '调整对象' }).selectOption('n');
  await editor.getByRole('button', { name: '向上微调' }).click();
  assert.equal((await rectValues()).y, 49); assert.equal((await rectValues()).height, 651);
  await button('撤销').click();
  // All eight handles, visible magnifier and one undo step per drag.
  for (const handle of ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']) {
    await button('放大选区').click();
    const bounds = await editor.locator(`[data-handle="${handle}"]`).boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 8, y + 8, { steps: 4 });
    await editor.locator('.region-lens').waitFor(); await page.mouse.up();
    assert.notDeepEqual(await rectValues(), target);
    await button('撤销').click(); assert.deepEqual(await rectValues(), target);
  }
  await page.screenshot({ path: '.tmp/screenshots/regions-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await button('精确调整').click();
  await editor.locator('.region-details.expanded').waitFor();
  assert((await editor.locator('.region-stage').boundingBox()).height > 140);
  assert.deepEqual(await rectValues(), target);
  await button('收起精调').click();
  await button('放大选区').click();
  const cdp = await context.newCDPSession(page);
  const stage = await editor.locator('.region-stage').boundingBox();
  const x = stage.x + stage.width / 2, y = stage.y + stage.height / 2;
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const point = (id, px, py) => ({ id, x: px, y: py });
  const beforeCamera = await editor.locator('.region-source').getAttribute('style');
  await touch('touchStart', [point(1, x - 35, y)]);
  await touch('touchStart', [point(1, x - 35, y), point(2, x + 35, y)]);
  await touch('touchMove', [point(1, x - 65, y - 10), point(2, x + 65, y + 10)]);
  await touch('touchEnd', [point(1, x - 65, y - 10)]);
  await touch('touchMove', [point(1, x - 30, y + 20)]);
  await touch('touchEnd', []);
  assert.notEqual(await editor.locator('.region-source').getAttribute('style'), beforeCamera);
  assert.deepEqual(await rectValues(), target, 'pinch and remaining finger must not edit the rectangle');
  await page.screenshot({ path: '.tmp/screenshots/regions-mobile.png' });
  await page.setViewportSize({ width: 844, height: 390 });
  assert((await editor.locator('.region-stage').boundingBox()).height > 100);
  await page.screenshot({ path: '.tmp/screenshots/regions-landscape.png' });
  await page.setViewportSize({ width: 1365, height: 900 });
  await button('确认此区域').click(); await button('完成').click();
  await editor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '应用（还需保存内容）', exact: true }).click();
  // A failed config save retains the local draft for retry.
  let failSave = true;
  await page.route('**/api/admin/v3/maps', async route => {
    if (route.request().method() === 'PUT' && failSave) { failSave = false; await route.fulfill({ status: 500, json: { error: 'fixture_save_failure' } }); }
    else await route.continue();
  });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('fixture_save_failure', { exact: true }).waitFor();
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('已保存', { exact: true }).first().waitFor();
  let config = await (await fetch(`${base}/api/admin/v3/maps`)).json();
  let saved = config.layouts.find(l => l.id === id);
  assert.deepEqual(saved.floorRegions.regions.floor1, target);
  assert(!saved.floorImages.floor1); assert(saved.floorImages.floor2);
  // Full image is shared across full/region views; no extra media request or img node.
  const media = [];
  page.on('request', r => { if (r.url().includes('/r2/')) media.push(r.url()); });
  await page.goto(`${base}/#/maps/${item.gameMapId}/${item.mode}/side/layout/${id}`);
  await page.waitForFunction(() => document.querySelector('#main-map-img')?.naturalWidth > 0);
  const image = await page.locator('#main-map-img').elementHandle();
  const initialUrl = await image.getAttribute('src'); const mediaCount = media.length;
  await page.getByRole('button', { name: '一楼', exact: true }).click();
  assert.equal(await page.locator('#main-map-img').getAttribute('src'), initialUrl);
  assert(await image.evaluate(node => node === document.querySelector('#main-map-img')));
  assert.equal(media.length, mediaCount);
  for (let rotation = 0; rotation < 4; rotation++) {
    await page.getByRole('button', { name: '顺时针旋转 90°' }).click();
    assert.equal(await page.locator('#map-wrapper').evaluate(el => getComputedStyle(el).overflow), 'hidden');
    assert.equal(await page.locator('#map-wrapper').evaluate(el => el.style.width), '650px');
  }
  await page.getByRole('button', { name: '全屏查看' }).click();
  await page.locator('#map-viewport').hover();
  await page.mouse.wheel(0, -240);
  await page.screenshot({ path: '.tmp/screenshots/region-frontend.png' });
  await page.getByTitle('退出全屏').click();
  await page.getByRole('button', { name: '二楼', exact: true }).click();
  assert.notEqual(await page.locator('#main-map-img').getAttribute('src'), initialUrl);
  // Unsaved adjustment cancellation preserves the existing rectangle.
  await openLayout();
  await page.getByRole('button', { name: '调整区域', exact: true }).first().click();
  await coordinates({ ...target, x: 80 }); await button('返回').click();
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await editor.waitFor({ state: 'detached' });
  await page.getByRole('button', { name: '调整区域', exact: true }).first().click();
  await coordinates(target); assert.deepEqual(await rectValues(), target);
  // Convert second floor while preserving first, then replace source with required reconfirmation.
  await editor.getByRole('combobox', { name: '当前编辑区域' }).selectOption('floor2');
  const second = { x: 30, y: 800, width: 700, height: 650 };
  await coordinates(second); await button('确认此区域').click(); await button('完成').click();
  await editor.waitFor({ state: 'detached' });
  const candidate = await sharp({ create: { width: 1000, height: 1600, channels: 3, background: '#285c83' } }).webp().toBuffer();
  let chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: '上传全图并设置区域' }).click();
  await (await chooser).setFiles({ name: 'full.webp', mimeType: 'image/webp', buffer: candidate });
  await button('确认此区域').waitFor(); await button('确认此区域').click();
  assert(await button('完成').isDisabled(), 'other converted floors must be reconfirmed');
  await editor.getByRole('combobox', { name: '当前编辑区域' }).selectOption('floor2');
  await button('确认此区域').click();
  let failUpload = true;
  await page.route('**/api/admin/v3/images', async route => {
    if (failUpload) { failUpload = false; await route.fulfill({ status: 500, json: { error: 'fixture_upload_failure' } }); }
    else await route.continue();
  });
  await button('完成').click(); await page.getByText('fixture_upload_failure', { exact: true }).waitFor();
  assert(await editor.isVisible());
  await button('完成').click(); await editor.waitFor({ state: 'detached' });
  await saveLayout();
  config = await (await fetch(`${base}/api/admin/v3/maps`)).json(); saved = config.layouts.find(l => l.id === id);
  assert.equal(saved.floorRegions.imageWidth, 1000); assert.equal(saved.floorRegions.imageHeight, 1600);
  assert.equal(saved.floorRegions.sourceKey, saved.floorImages.full.key);
  assert.deepEqual(saved.floorRegions.regions, { floor1: target, floor2: second });
  // Entry cropping uses the same editor and exports a square image + 300px thumbnail.
  await openLayout();
  await page.getByRole('button', { name: '裁剪', exact: true }).first().click();
  await page.getByRole('button', { name: '当前图片', exact: true }).click();
  await coordinates({ x: 10, y: 20, width: 350, height: 350 });
  await button('确认此区域').click(); await button('完成').click();
  await editor.waitFor({ state: 'detached' }); await saveLayout();
  config = await (await fetch(`${base}/api/admin/v3/maps`)).json(); saved = config.layouts.find(l => l.id === id);
  const entry = saved.entrances[0];
  for (const [asset, width] of [[entry.image, 350], [entry.thumb, 300]]) {
    const bytes = Buffer.from(await (await fetch(`${base}/r2/${asset.key}`)).arrayBuffer());
    const metadata = await sharp(bytes).metadata(); assert.equal(metadata.width, width); assert.equal(metadata.height, width);
  }
  assert.deepEqual(errors, []);
  console.log('PASS: pixel geometry, 8 handles, lens, undo/redo, trusted pinch, mobile/landscape, partial migration, failed-save retry, same image reuse, rotations/fullscreen, cancel, replacement reconfirmation, failed-upload retry, entry export');
} catch (e) {
  console.error((await page.locator('body').ariaSnapshot()).slice(-6500));
  await page.screenshot({ path: '.tmp/screenshots/regions-failure.png' });
  throw e;
} finally {
  const latest = await (await fetch(`${base}/api/admin/v3/maps`)).json();
  await fetch(`${base}/api/admin/v3/maps`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: latest.version, config: original }) });
  await browser.close();
}
