// PWA 离线验收：需先 pnpm build && pnpm preview（4173 端口）再运行
import { chromium } from 'playwright-core';

const URL = 'http://localhost:4173';
const results = [];
const ok = (name, cond, extra = '') =>
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();

// 1. 首次访问，等待 Service Worker 激活并 precache 完成
await page.goto(`${URL}/#/`, { waitUntil: 'networkidle' });
const swState = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  return reg.active?.state;
});
ok('Service Worker 激活', swState === 'activated', swState);
await page.waitForTimeout(2000); // 等 precache 落盘

// 2. 访问一张地图（runtime 缓存大图）
await page.goto(`${URL}/#/map/${encodeURIComponent('左-Y门')}/1`);
await page.waitForTimeout(1500);

// 3. 断网
await context.setOffline(true);

// 4. 离线刷新：壳子（precache）+ 访问过的图（runtime cache）都应可用
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1200);
ok('离线刷新页面可用', (await page.locator('#current-map-name').textContent())?.trim() === '左-Y门');
const imgOk = await page.locator('#main-map-img').evaluate((el) => el.complete && el.naturalWidth > 0);
ok('离线可看访问过的地图', imgOk);

// 5. 离线回目录：缩略图在 precache，应全部可显示
await page.goto(`${URL}/#/`);
await page.waitForTimeout(1200);
const thumbStats = await page.evaluate(() =>
  [...document.querySelectorAll('.map-card-item img')].map((i) => i.complete && i.naturalWidth > 0));
ok('离线目录页 28 张缩略图可用', thumbStats.length === 28 && thumbStats.every(Boolean),
  `${thumbStats.filter(Boolean).length}/${thumbStats.length}`);

// 6. 离线打开未访问过的地图：壳子可用，大图加载失败但页面不白屏
await page.goto(`${URL}/#/map/${encodeURIComponent('北-红门')}`);
await page.waitForTimeout(1200);
ok('离线未访问地图页面不白屏', (await page.locator('#current-map-name').textContent())?.trim() === '北-红门');

await context.setOffline(false);
await browser.close();
console.log(results.join('\n'));
process.exit(results.some((r) => r.startsWith('FAIL')) ? 1 : 0);
