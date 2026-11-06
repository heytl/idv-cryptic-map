// Run against scripts/verification-server.mjs, never against production.
import { chromium } from "playwright-core";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Verification must use local fixtures");
const shots = resolve(import.meta.dirname, "../../../.tmp/screenshots");
await mkdir(shots, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: 1365, height: 900 },
  serviceWorkers: "block",
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const count = async () =>
  Number((await (await fetch(`${base}/api/admin/stats`)).json()).total);
async function expectCount(n) {
  for (let i = 0; i < 50; i++) {
    if ((await count()) === n) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.equal(await count(), n);
}
try {
  await page.goto(`${base}/#/maps`);
  await page.locator(".condition-summary").waitFor();
  await page.locator(".condition-summary").click();
  assert.equal(await page.getByRole("dialog").getByRole("button", { name: "测试地图", exact: true }).count(), 1);
  await page.getByRole("button", { name: "关闭条件选择", exact: true }).click();
  await page.screenshot({ path: resolve(shots, "maps.png") });
  await page.locator(".map-card-item").first().waitFor();
  assert.equal(await page.locator(".map-card-item").count(), 28);
  const before = await count();
  await page.locator(".map-card-item").first().click();
  await page.locator("#main-map-img").waitFor();
  await expectCount(before + 1);
  await page.getByRole("button", { name: "一楼", exact: true }).click();
  await page.waitForURL(/floor1$/);
  await expectCount(before + 1);
  await page.reload();
  await page.locator("#main-map-img").waitFor();
  await expectCount(before + 2);
  await page.getByRole("button", { name: "返回手记目录" }).click();
  await page.locator(".map-card-item").first().click();
  await expectCount(before + 3);
  await page.goto(`${base}/#/nightmare/front`);
  await page.locator(".map-card-item").first().waitFor();
  assert.match(page.url(), /maps\/lady-of-doom\/nightmare\/front/);
  await page.goto(`${base}/#/v1/map/old`);
  await page.locator(".condition-summary").click();
  await page.getByRole("dialog").getByRole("button", { name: "测试地图", exact: true }).click();
  const hardOption = page.getByRole("dialog").getByRole("button", { name: "困难", exact: true });
  if (await hardOption.count()) await hardOption.click();
  await page.getByRole("dialog").getByRole("button", { name: /^侧门(?:\s*✓)?$/ }).click();
  await page.locator(".map-card-item").waitFor();
  assert.equal(await page.locator(".map-card-item").count(), 1);
  await page.locator(".map-card-item").click();
  await page.waitForURL(/second\/hard\/side\/layout\/999/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(shots, "mobile-detail.png") });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  );
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto(`${base}/admin/`);
  await page.getByText("地图管理", { exact: true }).click();
  await page.getByRole('button', { name: '配置地图厄运之女', exact: true }).click();
  const initialConfig = await (await fetch(`${base}/api/admin/v4/maps`)).json();
  const sideUsage = page.getByRole("combobox", { name: "侧门使用方式", exact: true });
  await sideUsage.click();
  await page.locator('.n-base-select-option').filter({ hasText: /^不使用$/ }).click();
  assert.match(await sideUsage.innerText(), /开放/);
  await page.getByRole("switch", { name: "前台显示", exact: true }).click();
  let savedResponse = page.waitForResponse(r => r.url().includes('/api/admin/v4/maps') && r.request().method() === 'PUT');
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  assert.equal((await savedResponse).status(), 200);
  const hiddenConfig = await (await fetch(`${base}/api/admin/v4/maps`)).json();
  assert.deepEqual(hiddenConfig.layouts, initialConfig.layouts);
  assert.deepEqual(hiddenConfig.gameMaps.find(m => m.id === 'lady-of-doom').difficulties[0].entranceRules,
    initialConfig.gameMaps.find(m => m.id === 'lady-of-doom').difficulties[0].entranceRules);
  await page.goto(`${base}/#/maps/lady-of-doom/hard/side`);
  await page.waitForURL(/lady-of-doom\/nightmare\/front$/);
  await page.locator('.condition-summary').click();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^困难/ }).count(), 0);
  await page.goto(`${base}/admin/#maps`);
  await page.getByRole('button', { name: '配置地图厄运之女', exact: true }).click();
  await page.getByRole("switch", { name: "前台显示", exact: true }).click();
  savedResponse = page.waitForResponse(r => r.url().includes('/api/admin/v4/maps') && r.request().method() === 'PUT');
  await page.getByRole("button", { name: "保存修改", exact: true }).click();
  assert.equal((await savedResponse).status(), 200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '返回地图', exact: true }).click();
  assert(await page.getByRole('textbox', { name: '搜索地图', exact: true }).isVisible());
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: resolve(shots, 'map-settings-mobile.png'), animations: 'disabled' });
  await page.setViewportSize({ width: 1365, height: 1000 });
  await page.screenshot({ path: resolve(shots, 'map-settings-desktop.png'), animations: 'disabled' });
  await page.getByRole("button", { name: "新增地图", exact: true }).click();
  await page.getByRole('textbox', {name:'地图名称',exact:true}).fill('验收新地图');
  await page.getByRole('button', {name:'确定',exact:true}).click();
  const save = page.getByRole("button", { name: "保存修改", exact: true });
  await save.click();
  await page.getByText("已保存", { exact: true }).first().waitFor();
  const config = await (await fetch(`${base}/api/admin/v4/maps`)).json();
  assert(config.gameMaps.some((m) => m.name === "验收新地图" && !m.published));
  assert.deepEqual(config.gameMaps.find(m => m.name === "验收新地图").difficulties, []);
  await page.getByText("布局管理", { exact: true }).click();
  const beforeReorder = await (await fetch(`${base}/api/admin/v4/maps`)).json();
  const ownLayouts = beforeReorder.layouts.filter(l => l.gameMapId === 'lady-of-doom' && l.mode === 'hard' && !l.deletedAt);
  const otherLayouts = beforeReorder.layouts.filter(l => l.gameMapId !== 'lady-of-doom' || l.mode !== 'hard');
  await page.locator('.v2-map-card').first().getByRole('button', { name: '下移', exact: true }).click();
  savedResponse = page.waitForResponse(r => r.url().includes('/api/admin/v4/maps') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  assert.equal((await savedResponse).status(), 200);
  const afterReorder = await (await fetch(`${base}/api/admin/v4/maps`)).json();
  assert.deepEqual(afterReorder.layouts.filter(l => l.gameMapId !== 'lady-of-doom' || l.mode !== 'hard'), otherLayouts);
  const expectedOrder = ownLayouts.map(l => l.id);
  [expectedOrder[0], expectedOrder[1]] = [expectedOrder[1], expectedOrder[0]];
  assert.deepEqual(afterReorder.layouts.filter(l => l.gameMapId === 'lady-of-doom' && l.mode === 'hard' && !l.deletedAt).sort((a,b) => a.sort - b.sort).map(l => l.id), expectedOrder);
  await page.getByText("访问统计", { exact: true }).click();
  await page.getByRole("heading", { name: "访问趋势", exact: true }).waitFor();
  await page.screenshot({ path: resolve(shots, "statistics.png") });
  await page.getByText("备份与恢复", { exact: true }).click();
  await page
    .getByRole("button", { name: "恢复", exact: true })
    .first()
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "PASS: map choice, legacy links, detail visits, map isolation, difficulty hide/restore, retained records, entry removal guard, responsive map settings, map creation, scoped layout ordering, statistics, backups, browser errors",
  );
} finally {
  await browser.close();
}
