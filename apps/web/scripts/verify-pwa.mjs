import { chromium } from "playwright-core";
import assert from "node:assert/strict";
const base = process.env.TEST_URL || "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw new Error("Use isolated local verification server");
const original = await (await fetch(`${base}/api/admin/v3/maps`)).json();
const candidate = structuredClone(original);
const regionLayout = candidate.layouts.find(l => l.id === 999);
regionLayout.floorRegions = { sourceKey: regionLayout.floorImages.full.key, imageWidth: 900, imageHeight: 1500,
  regions: { floor1: { x: 0, y: 0, width: 900, height: 700 }, floor2: { x: 0, y: 700, width: 900, height: 800 } } };
delete regionLayout.floorImages.floor1;
delete regionLayout.floorImages.floor2;
const saved = await fetch(`${base}/api/admin/v3/maps`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseVersion: original.version, config: candidate }) });
assert(saved.ok);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext();
const page = await context.newPage();
try {
  await page.goto(`${base}/#/maps`);
  await page.locator(".condition-summary").waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.locator(".condition-summary").click();
  await page.getByRole("dialog").getByRole("button", { name: "测试地图", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^侧门(?:\s*✓)?$/ }).click();
  await page.getByRole("button", { name: "下载当前地图离线包" }).click();
  await page
    .getByRole("button", { name: "✓ 已可离线使用 · 复查" })
    .waitFor({ timeout: 30000 });
  await page.locator(".map-card-item").click();
  await page.locator("#main-map-img").waitFor();
  await page.waitForFunction(() => {
    const i = document.querySelector("#main-map-img");
    return i?.complete && i.naturalWidth > 0;
  });
  const fullUrl = await page.locator("#main-map-img").getAttribute("src");
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("#main-map-img").waitFor();
  await page.waitForFunction(() => {
    const i = document.querySelector("#main-map-img");
    return i?.complete && i.naturalWidth > 0;
  });
  await page.getByRole("button", { name: "二楼", exact: true }).click();
  await page.waitForFunction(() => {
    const i = document.querySelector("#main-map-img");
    return i?.complete && i.naturalWidth > 0;
  });
  assert.equal(await page.locator("#main-map-img").getAttribute("src"), fullUrl);
  assert.equal(await page.locator("#map-wrapper").evaluate(el => el.style.height), "800px");
  await page.getByRole("button", { name: "一楼", exact: true }).click();
  assert.equal(await page.locator("#main-map-img").getAttribute("src"), fullUrl);
  await page.getByRole("button", { name: "返回手记目录" }).click();
  await page.locator(".map-card-item").waitFor();
  assert.equal(await page.locator(".map-card-item").count(), 1);
  assert.match(page.url(), /second/);
  console.log(
    "PASS: SW activation, selected-map package, offline reload, offline floor image, offline catalog",
  );
} catch (error) {
  console.error(await page.locator("body").ariaSnapshot());
  throw error;
} finally {
  const current = await (await fetch(`${base}/api/admin/v3/maps`)).json();
  await fetch(`${base}/api/admin/v3/maps`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseVersion: current.version, config: original }) });
  await browser.close();
}
