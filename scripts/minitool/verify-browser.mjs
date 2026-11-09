// Modern Chrome regression with CSP and missing-API fixtures, not device certification.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root,'dist/minitool');
const scratch = resolve(root,'.tmp/minitool');
const require = createRequire(resolve(root,'apps/web/package.json'));
const { chromium } = require('playwright-core');
const requireVite = createRequire(require.resolve('vite/package.json'));
const postcss = requireVite('postcss');
const build = JSON.parse(await readFile(resolve(scratch,'build.json'),'utf8'));
const config = JSON.parse(await readFile(resolve(root,build.configPath),'utf8'));
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.json':'application/json'};
let legacyCss = false;
const server = createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const path = resolve(out,'.' + (name.endsWith('/') ? name+'index.html' : name));
    assert(path.startsWith(out + sep));
    let content = await readFile(path);
    // Match container-injected safe-area variables before the entry script runs.
    if (path.endsWith('.html')) content = Buffer.from(content.toString().replace('<head>',
      '<head><style>html{--safe-area-inset-top:47px;--safe-area-inset-bottom:28px}</style>'));
    if (legacyCss && path.endsWith('.css')) {
      const css = postcss.parse(content.toString());
      css.walkAtRules('supports', rule => { if (rule.params.includes('aspect-ratio')) rule.remove(); });
      css.walkDecls(decl => {
        if (/^(gap|row-gap|column-gap|aspect-ratio|inset(?:-.+)?|padding-inline|margin-inline)$/.test(decl.prop)
          || /(?:clamp|color-mix|\bmin|\bmax|env)\(|\d(?:dvh|svh|lvh)/.test(decl.value)) decl.remove();
      });
      content = Buffer.from(css.toString());
    }
    response.writeHead(200, {'Content-Type':mime[extname(path)] || 'application/octet-stream',
      'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; worker-src 'none'; frame-src 'none'"});
    response.end(content);
  } catch { response.writeHead(404); response.end(); }
});
await new Promise(done => server.listen(0,'127.0.0.1',done));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({channel:'chrome',headless:true});
const errors = [], outbound = [], badResponses = [];
const results = [];
try {
  for (const legacy of [false,true]) {
    legacyCss = legacy;
    const context = await browser.newContext({viewport:{width:375,height:844},serviceWorkers:'block',hasTouch:true});
    await context.route('**/*', route => {
      if (!route.request().url().startsWith(base+'/')) { outbound.push(route.request().url()); return route.abort(); }
      return route.continue();
    });
    await context.addInitScript(({legacy}) => {
      const calls = []; window.__miniStorageCalls = calls;
      window.xhs = {launchOptions:{miniToolEnv:{buildVersion:9533000}},miniTool:{
        async getStorage({key}) { calls.push(['get',key]); return {data:JSON.stringify(key==='idv-catalog-compact'?'1':'{}')}; },
        async setStorage({key,data}) { calls.push(['set',key,data]); return {}; },
      }};
      if (!legacy) window.xhs.miniTool.getWindowInfo = async () => ({
        safeArea:{top:47,bottom:innerHeight-28,left:0,right:innerWidth},
        menuButtons:{back:{left:8,top:50,right:40,bottom:82,width:32,height:32},
          share:{left:innerWidth-48,top:50,right:innerWidth-16,bottom:82,width:32,height:32}},
      });
      for (const name of ['fetch','XMLHttpRequest','WebSocket','Worker','SharedWorker']) window[name] = function(){throw Error('Forbidden capability '+name);};
      Object.defineProperty(navigator,'clipboard',{get(){throw Error('Forbidden clipboard');}});
      Object.defineProperty(navigator,'serviceWorker',{get(){throw Error('Forbidden service worker');}});
      Object.defineProperty(window,'localStorage',{get(){throw Error('Use platform Storage');}});
      if (legacy) {
        Object.fromEntries = undefined; Array.prototype.flatMap = undefined;
        window.ResizeObserver = undefined; window.structuredClone = undefined;
        HTMLDialogElement.prototype.showModal = undefined; HTMLDialogElement.prototype.close = undefined;
        const height = Object.getOwnPropertyDescriptor(Element.prototype,'scrollHeight');
        Object.defineProperty(Element.prototype,'scrollHeight',{get(){
          if (this.style?.visibility === 'hidden' && this.style.rowGap === '1px') return 0;
          return height.get.call(this);
        }});
      }
    },{legacy});
    const page = await context.newPage();
    page.on('pageerror', error => { errors.push(error.message); console.error('PAGE_ERROR:'+error.message); });
    page.on('response', response => { if (response.status()>=400) badResponses.push(response.url()); });
    await page.goto(base+'/');
    await page.locator('.map-card-item').first().waitFor();
    assert.equal(await page.locator('.update-time time').getAttribute('datetime'),config.updatedAt,'Rendered timestamp matches the captured source');
    assert(await page.locator('.entry-grid').evaluate(el=>el.classList.contains('compact')), 'Platform preference was read');
    await page.getByTitle('标准视图',{exact:true}).click();
    await page.getByTitle('紧凑视图：一行显示更多卡片',{exact:true}).tap();
    assert.equal(await page.getByTitle('紧凑视图：一行显示更多卡片',{exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none','Touch must not leave a keyboard focus outline');
    await page.keyboard.press('Tab');
    assert(await page.evaluate(()=>document.documentElement.classList.contains('mini-keyboard-focus')),'Keyboard focus remains available');
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle),'none','Keyboard focus is visible');
    await page.getByTitle('标准视图',{exact:true}).tap();
    assert.equal(await page.getByTitle('标准视图',{exact:true}).evaluate(el=>getComputedStyle(el).outlineStyle),'none','A new touch clears keyboard focus styling');
    await page.waitForFunction(()=>window.__miniStorageCalls.some(call=>call[0]==='set'));
    await page.locator('.condition-summary').click();
    await page.locator('.condition-dialog[open]').waitFor();
    await page.getByRole('button',{name:'关闭条件选择',exact:true}).click();
    assert.equal(await page.locator('.condition-dialog[open]').count(),0);

    let catalogues=0;
    for (const map of config.gameMaps) for (const difficulty of map.difficulties) for (const entrance of difficulty.enabledEntrances) {
      const expected=config.layouts.filter(layout=>layout.gameMapId===map.id && layout.mode===difficulty.difficultyId && layout.entrances.some(e=>e.type===entrance));
      await page.goto(`${base}/#/maps/${map.id}/${difficulty.difficultyId}/${entrance}`);
      await page.waitForFunction(count=>document.querySelectorAll('.map-card-item').length===count,expected.length);
      catalogues++;
    }
    let layouts=0, floors=0;
    const selected=legacy ? config.layouts.filter((layout,index)=>index===0 || index===config.layouts.length-1) : config.layouts;
    for (const layout of selected) {
      const entrance=layout.entrances[0];
      await page.goto(`${base}/#/maps/${layout.gameMapId}/${layout.mode}/${entrance.type}/layout/${layout.id}`);
      await page.locator('#main-map-img').waitFor();
      await page.waitForFunction(()=>{const img=document.getElementById('main-map-img');return img.complete && img.naturalWidth>0;});
      assert.equal(await page.locator('.map-title').textContent(),layout.displayName);
      const count=await page.locator('.switch-btn').count();
      if (count>1) {
        await page.locator('.switch-btn').nth(count-1).click();
        await page.waitForFunction(()=>document.querySelector('.switch-btn:last-child')?.classList.contains('active'));
        floors++;
      }
      await page.getByRole('button',{name:'入口参考',exact:true}).click();
      await page.locator('.reference-dialog[open]').waitFor();
      await page.getByRole('button',{name:'关闭入口参考',exact:true}).click();
      layouts++;
      if (layouts % 20 === 0) console.log(`Checked ${layouts}/${selected.length} layouts (${legacy?'fallback':'modern'})`);
    }
    const layout=config.layouts[0];
    await page.goto(`${base}/#/maps/${layout.gameMapId}/${layout.mode}/${layout.entrances[0].type}/layout/${layout.id}`);
    await page.locator('#main-map-img').waitFor();
    const beforeZoom = await page.locator('#map-wrapper').evaluate(el=>el.style.transform);
    await page.locator('#map-viewport').hover(); await page.mouse.wheel(0,-120);
    await page.waitForFunction(value=>document.getElementById('map-wrapper').style.transform!==value,beforeZoom);
    await page.getByRole('button',{name:'顺时针旋转 90°',exact:true}).click();
    const sizes=[];
    for (const width of [320,375,844]) {
      await page.setViewportSize({width,height:width===844?390:844});
      await page.waitForTimeout(200);
      const geometry=await page.locator('#map-viewport').evaluate(el=>({width:el.clientWidth,height:el.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth+1}));
      assert(geometry.width>0 && geometry.height>80, 'Usable viewport at '+width);
      assert(!geometry.overflow,'No page overflow at '+width);
      const title=await page.locator('.map-title-container').boundingBox();
      const back=await page.locator('.btn-back').boundingBox();
      const reference=await page.locator('.reference-trigger').boundingBox();
      const reservedTop=await page.evaluate(()=>parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--mini-top')));
      assert.equal(reservedTop,legacy?91:82,'Reserved height ends exactly at the native buttons; fallback keeps its safe row');
      assert.equal(await page.locator('.control-bar').evaluate(el=>getComputedStyle(el,'::before').backgroundColor),'rgba(0, 0, 0, 0)','The native reserve and toolbar share the page canvas');
      assert([title,back,reference].every(rect=>rect.y>=reservedTop),'The entire original toolbar stays below the native buttons');
      assert(Math.abs(title.y+title.height/2-back.y-back.height/2)<1,'The title and back button keep the original shared row');
      assert(Math.abs(title.y+title.height/2-reference.y-reference.height/2)<1,'The reference action keeps the original shared row');
      assert(back.x+back.width<=title.x+1 && title.x+title.width<=reference.x+1,'The original toolbar order is preserved');
      sizes.push({width,...geometry});
      await page.screenshot({path:resolve(scratch,`detail-${legacy?'fallback':'modern'}-${width}.png`)});
    }
    const phosphor=config.layouts.find(item=>item.gameMapId==='phosphorescence-disease'&&item.mode==='hard');
    if (phosphor) {
      await page.setViewportSize({width:375,height:844});
      await page.goto(`${base}/#/maps/${phosphor.gameMapId}/${phosphor.mode}/${phosphor.entrances[0].type}/layout/${phosphor.id}`);
      await page.waitForFunction(()=>{const image=document.getElementById('main-map-img');return image?.complete&&image.naturalWidth>0;});
      await page.screenshot({path:resolve(scratch,`topbar-${legacy?'fallback':'modern'}-375.png`)});
    }
    await page.goto(base+'/#/about'); await page.locator('.website-address').waitFor();
    await page.locator('.copy-button').click();
    assert((await page.evaluate(()=>window.getSelection().toString())).includes('idv-map'));
    assert.equal(await page.locator('a[href^="http"]').count(),0);
    await page.goto(base+'/#/changelog'); await page.locator('.changelog-page').waitFor();
    results.push({mode:legacy?'missing APIs and legacy CSS fixture':'modern Chrome',catalogues,layouts,floorChanges:floors,sizes});
    console.log('Completed '+(legacy?'fallback':'modern')+' regression');
    await context.close();
  }
  assert.deepEqual(outbound,[],'No outbound requests'); assert.deepEqual(badResponses,[],'No missing resources'); assert.deepEqual(errors,[],'No JS errors');
  const report={result:'pass',results,errors,outbound,badResponses,deviceCertification:false};
  await writeFile(resolve(scratch,'browser.json'),JSON.stringify(report,null,2)+'\n');
  console.log('BROWSER_REGRESSION:'+JSON.stringify(report));
} finally { await browser.close(); await new Promise(done=>server.close(done)); }
