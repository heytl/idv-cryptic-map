// Exercise a first-publication response while an older editor draft is open.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const base = process.env.TEST_URL || 'http://127.0.0.1:8787';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use local fixtures only');
const read = () => fetch(`${base}/api/admin/v4/maps`).then(r => r.json());
const original = await read();
const candidate = structuredClone(original);
const layout = structuredClone(candidate.layouts.find(l => l.gameMapId === 'lady-of-doom' && l.mode === 'hard' && l.published && !l.deletedAt));
layout.id = Math.max(...candidate.layouts.map(l => l.id)) + 1;
layout.displayName = `publication-race-${randomUUID().slice(0, 8)}`;
layout.published = false;
layout.modeLocked = false;
layout.entrances.forEach(e => { e.id = randomUUID(); });
candidate.layouts.push(layout);
const setup = await fetch(`${base}/api/admin/v4/maps`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: candidate, baseVersion: original.version }) });
assert.equal(setup.status, 200, await setup.text());
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  await page.goto(`${base}/admin/#layouts`);
  const card = page.locator('.v2-map-card').filter({ hasText: layout.displayName });
  await card.getByRole('switch').click();
  let release, started;
  const captured = new Promise(resolve => { started = resolve; });
  await page.route('**/api/admin/v4/maps', async route => {
    if (route.request().method() !== 'PUT') return route.continue();
    await new Promise(resolve => { release = resolve; started(); });
    await route.continue();
  });
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await captured;
  await card.getByRole('button', { name: '编辑', exact: true }).click();
  const response = page.waitForResponse(r => r.url().endsWith('/api/admin/v4/maps') && r.request().method() === 'PUT');
  release();
  assert.equal((await response).status(), 200);
  await page.unroute('**/api/admin/v4/maps');
  const editor = page.locator('.editor-modal');
  await editor.getByRole('switch').click();
  await page.waitForFunction(() => document.querySelector('[aria-label="布局难度"] .n-base-selection--disabled'));
  await editor.getByRole('button', { name: '应用（还需保存内容）', exact: true }).click();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/admin/v4/maps') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  assert.equal((await saved).status(), 200);
  const persisted = (await read()).layouts.find(l => l.id === layout.id);
  assert.equal(persisted.modeLocked, true);
  assert.equal(persisted.published, false);
  console.log('PASS: first publication permanently locks an already-open editor; applying and saving its draft cannot unlock the layout.');
} finally {
  await browser.close();
  const current = await read();
  const restored = await fetch(`${base}/api/admin/v4/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: `backups-v4/snapshot-v${original.version}.json`, baseVersion: current.version }) });
  assert.equal(restored.status, 200, await restored.text());
}
