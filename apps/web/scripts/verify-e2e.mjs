// Phase 2/3/4 验收脚本：驱动本机 Chrome 对新站做交互验证，并截图新旧站对照
import { chromium } from 'playwright-core';

const NEW = 'http://localhost:5173';
const OLD = 'http://localhost:8800';
const SHOT = process.env.SHOT_DIR;
const results = [];
const ok = (name, cond, extra = '') =>
  results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const failed404 = [];
page.on('response', (r) => r.status() === 404 && failed404.push(r.url()));

// 1. 目录页
await page.goto(`${NEW}/#/`, { waitUntil: 'networkidle' });
ok('目录页 28 张卡片', (await page.locator('.map-card-item').count()) === 28);
await page.screenshot({ path: `${SHOT}/new-catalog.png` });

// 2. 方向筛选
await page.click('.tab-btn[data-filter="北"]');
await page.waitForTimeout(300);
ok('筛选“北”后 hash', page.url().endsWith('#/dir/北') || decodeURIComponent(page.url()).endsWith('#/dir/北'), page.url());
ok('筛选“北”后 8 张卡片', (await page.locator('.map-card-item').count()) === 8);
await page.reload({ waitUntil: 'networkidle' });
ok('刷新后筛选保持', (await page.locator('.map-card-item').count()) === 8);

// 3. 密度切换 + localStorage 记忆
await page.click('.density-opt[data-density="compact"]');
await page.waitForTimeout(200);
ok('紧凑视图 class', await page.locator('#entry-grid.compact').count() === 1);
await page.reload({ waitUntil: 'networkidle' });
ok('刷新后紧凑视图记忆', await page.locator('#entry-grid.compact').count() === 1);
await page.click('.density-opt[data-density="comfort"]');

// 4. 点击卡片进入攻略页
await page.click('.tab-btn[data-filter="all"]');
await page.waitForTimeout(200);
await page.click('.map-card-item:first-child');
await page.waitForTimeout(500);
ok('进入攻略页 hash', decodeURIComponent(page.url()).includes('#/map/左-Y门'), decodeURIComponent(page.url()));
ok('攻略页标题', (await page.locator('#current-map-name').textContent())?.trim() === '左-Y门');
ok('document.title 同步', (await page.title()).startsWith('左-Y门 |'), await page.title());
await page.waitForTimeout(600);
await page.screenshot({ path: `${SHOT}/new-strategy.png` });

// 5. 楼层切换（hash replace + 图片变化）
const fullSrc = await page.locator('#main-map-img').getAttribute('src');
await page.click('.switch-btn[data-floor="1"]');
await page.waitForTimeout(500);
ok('切 1 楼 hash', decodeURIComponent(page.url()).includes('/左-Y门/1'), decodeURIComponent(page.url()));
const f1Src = await page.locator('#main-map-img').getAttribute('src');
ok('切 1 楼图片变化', f1Src !== fullSrc);

// 6. 房间高亮（左-Y门 1 楼有坐标数据）
ok('房间面板显示', await page.locator('.room-selector-panel').isVisible());
await page.click('.room-btn:has-text("餐厅")');
await page.waitForTimeout(400);
ok('高亮层显示', await page.locator('#highlight-overlay').isVisible());
const t1 = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
await page.click('.room-btn:has-text("餐厅")');
await page.waitForTimeout(200);
ok('再点取消高亮', !(await page.locator('#highlight-overlay').isVisible()));

// 7. 缩放工具栏（旧站 CSS 有意隐藏 +/- 按钮，保留手势与滚轮缩放——新站需一致）
const scaleOf = (t) => parseFloat(t.match(/scale\(([\d.]+)\)/)?.[1] ?? '0');
ok('+/- 按钮与旧站一致隐藏', !(await page.locator('.zoom-in-btn').isVisible())
  && !(await page.locator('.zoom-out-btn').isVisible()));
const t4 = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);

// 8. 滚轮缩放（以指针为锚）+ 重置按钮（重置 = 回到自适应 fitScale，且幂等）
await page.locator('#map-viewport').hover();
await page.mouse.wheel(0, -240);
await page.waitForTimeout(200);
const t5 = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
ok('滚轮放大生效', scaleOf(t5) > scaleOf(t4), `${scaleOf(t4)} -> ${scaleOf(t5)}`);
await page.click('.reset-btn');
await page.waitForTimeout(200);
const t6 = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
await page.click('.reset-btn');
await page.waitForTimeout(200);
const t6b = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
ok('重置恢复自适应且幂等', scaleOf(t6) < scaleOf(t5) && t6 === t6b, `${scaleOf(t5)} -> ${scaleOf(t6)}`);

// 9. 拖拽平移（自适应铺满时会被边界钳制居中——与旧站一致，需先放大再拖）
await page.locator('#map-viewport').hover();
await page.mouse.wheel(0, -480);
await page.waitForTimeout(200);
const before = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
const vp = await page.locator('#map-viewport').boundingBox();
await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
await page.mouse.down();
await page.mouse.move(vp.x + vp.width / 2 - 120, vp.y + vp.height / 2 - 60, { steps: 5 });
await page.mouse.up();
const after = await page.locator('#map-wrapper').evaluate((el) => el.style.transform);
ok('拖拽平移生效', before !== after, `${before} -> ${after}`);
await page.click('.reset-btn');

// 10. 全屏进出
await page.click('.fullscreen-btn');
await page.waitForTimeout(300);
ok('进入页内全屏', await page.locator('#map-viewport.in-page-fullscreen').count() === 1);
await page.screenshot({ path: `${SHOT}/new-fullscreen.png` });
await page.click('.fullscreen-close-btn');
await page.waitForTimeout(300);
ok('退出全屏', await page.locator('#map-viewport.in-page-fullscreen').count() === 0);

// 11. 返回目录（从目录进入 → history.back 行为）
await page.click('#back-btn');
await page.waitForTimeout(400);
ok('返回目录', decodeURIComponent(page.url()).endsWith('#/'), decodeURIComponent(page.url()));

// 12. 旧格式链接直达（URL 编码 + 楼层 + “（新）”后缀）
// hash 同页跳转不会重载页面，用 reload 模拟真实“分享链接直达”场景
await page.goto(`${NEW}/#/map/${encodeURIComponent('左-Y门')}/2`);
await page.reload({ waitUntil: 'networkidle' });
ok('URL编码链接直达 2 楼', (await page.locator('#current-map-name').textContent())?.trim() === '左-Y门'
  && (await page.locator('.switch-btn.active').getAttribute('data-floor')) === '2');
await page.goto(`${NEW}/#/map/${encodeURIComponent('左-Y青蛙房（新）')}`);
await page.reload({ waitUntil: 'networkidle' });
ok('“（新）”展示名旧链接直达', (await page.locator('#current-map-name').textContent())?.trim() === '左-Y青蛙房（新）');
// 直达时返回按钮应跳目录而非退出站点
await page.click('#back-btn');
await page.waitForTimeout(400);
ok('直达后返回按钮回目录', decodeURIComponent(page.url()).endsWith('#/'));

// 13. 未知地图兜底：直达（守卫拦截）与同页 hash 变化（组件内兜底）两条路径
await page.goto(`${NEW}/#/map/不存在的门/1`);
await page.reload({ waitUntil: 'networkidle' });
ok('直达未知地图回目录', decodeURIComponent(page.url()).endsWith('#/'));
await page.goto(`${NEW}/#/map/${encodeURIComponent('左-Y门')}`);
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '#/map/不存在的门'; });
await page.waitForTimeout(500);
ok('同页切到未知地图回目录', decodeURIComponent(page.url()).endsWith('#/'), decodeURIComponent(page.url()));

// 14. 字体自托管
const fontHosts = await page.evaluate(() =>
  performance.getEntriesByType('resource').filter((r) => r.name.includes('fonts.g')).length);
ok('无 Google Fonts 请求', fontHosts === 0);
const fontsLoaded = await page.evaluate(async () => {
  await document.fonts.ready;
  return ['Cinzel', 'Ma Shan Zheng', 'Noto Serif SC'].map((f) => [f, document.fonts.check(`16px "${f}"`)]);
});
for (const [f, loaded] of fontsLoaded) ok(`字体 ${f} 已加载`, loaded);

// 15. 移动端 375px 快照 + 触摸模拟
const mpage = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await mpage.goto(`${NEW}/#/`, { waitUntil: 'networkidle' });
await mpage.screenshot({ path: `${SHOT}/new-mobile-catalog.png` });
await mpage.goto(`${NEW}/#/map/${encodeURIComponent('南-十字门')}/1`, { waitUntil: 'networkidle' });
await mpage.waitForTimeout(600);
const mBefore = await mpage.locator('#map-wrapper').evaluate((el) => el.style.transform);
const mScale = (t) => parseFloat(t.match(/scale\(([\d.]+)\)/)?.[1] ?? '0');
// 双指捏合放大（先放大，后续单指拖拽才不会被边界钳制回居中）
await mpage.locator('#map-viewport').evaluate((el) => {
  const mk = (x, y, id) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(cx - 30, cy, 1), mk(cx + 30, cy, 2)], bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(cx - 80, cy, 1), mk(cx + 80, cy, 2)], bubbles: true, cancelable: true }));
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
});
const mAfterPinch = await mpage.locator('#map-wrapper').evaluate((el) => el.style.transform);
ok('移动端双指捏合放大', mScale(mAfterPinch) > mScale(mBefore), `${mScale(mBefore)} -> ${mScale(mAfterPinch)}`);
// 单指拖拽
await mpage.locator('#map-viewport').evaluate((el) => {
  const mk = (x, y, id) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(cx, cy, 1)], bubbles: true }));
  el.dispatchEvent(new TouchEvent('touchmove', { touches: [mk(cx - 60, cy - 40, 1)], bubbles: true, cancelable: true }));
  el.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }));
});
const mAfterDrag = await mpage.locator('#map-wrapper').evaluate((el) => el.style.transform);
ok('移动端单指拖拽', mAfterPinch !== mAfterDrag, `${mAfterPinch} -> ${mAfterDrag}`);
await mpage.screenshot({ path: `${SHOT}/new-mobile-strategy.png` });
await mpage.close();

// 16. 旧站对照截图
const oldPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await oldPage.goto(`${OLD}/#/`, { waitUntil: 'networkidle' });
await oldPage.waitForTimeout(800);
await oldPage.screenshot({ path: `${SHOT}/old-catalog.png` });
await oldPage.goto(`${OLD}/#/map/${encodeURIComponent('左-Y门')}/1`, { waitUntil: 'networkidle' });
await oldPage.waitForTimeout(800);
await oldPage.screenshot({ path: `${SHOT}/old-strategy.png` });
await oldPage.close();

// 新站同路由截图（与旧站对照）
await page.goto(`${NEW}/#/map/${encodeURIComponent('左-Y门')}/1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await page.screenshot({ path: `${SHOT}/new-strategy-f1.png` });

// /_vercel/insights 仅在 Vercel 线上存在，本地 404 是预期行为（旧站同样如此）
const real404 = failed404.filter((u) => !u.includes('/_vercel/'));
const realErrors = errors.filter((e) => !e.includes('Failed to load resource'));
ok('无 404 请求', real404.length === 0, real404.join(','));
ok('无页面 JS 错误', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();
console.log(results.join('\n'));
const fails = results.filter((r) => r.startsWith('FAIL'));
process.exit(fails.length ? 1 : 0);
