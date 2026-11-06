// This scenario only changes the isolated local verification service.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
const base=process.env.TEST_URL || 'http://127.0.0.1:8787';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use local fixtures only');
const admin=()=>fetch(`${base}/api/admin/v4/maps`).then(r=>r.json());
const original=await admin(), candidate=structuredClone(original);
const source=candidate.layouts.find(l=>l.published&&!l.deletedAt&&l.floorImages.full);
const suffix=randomUUID().slice(0,8);
const mode=`dynamic-abyss-${suffix}`, mapId=`dynamic-phosphorescence-${suffix}`, entry=`dynamic-shaft-${suffix}`;
candidate.difficulties.push({id:mode,name:'深渊',sort:30});
candidate.entranceTypes.push({id:entry,name:'竖井',sort:40});
candidate.gameMaps.push({id:mapId,name:'磷光症',sort:100,published:true,difficulties:[{difficultyId:mode,sort:10,visible:true,floors:['负一楼','负二楼','负三楼','负四楼'].map((name,i)=>({id:`b${i+1}`,name,sort:i,visible:true})),entranceRules:{allowed:[entry],enabled:[entry]},entranceFilters:{[entry]:{filterLabel:'颜色',filterOptions:[{id:'blue',name:'蓝色',sort:10}]}}}]});
const layout={id:Math.max(...candidate.layouts.map(l=>l.id))+1,gameMapId:mapId,mode,modeLocked:false,name:'dynamic-layout',displayName:'磷光症动态验收',remarks:'后台运行时文字：深渊、负四楼',sort:10,published:true,floorImages:{full:source.floorImages.full},floorRegions:{sourceKey:source.floorImages.full.key,imageWidth:900,imageHeight:1500,regions:Object.fromEntries([1,2,3,4].map((i)=>[`b${i}`,{x:0,y:(i-1)*300,width:900,height:300}]))},entrances:[{id:`dynamic-shaft-instance-${suffix}`,type:entry,filterValue:'blue',image:source.entrances.find(e=>e.image).image}]};
candidate.layouts.push(layout);
const saved=await fetch(`${base}/api/admin/v4/maps`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:candidate,baseVersion:original.version})});
assert.equal(saved.status,200,await saved.text());
const browser=await chromium.launch({channel:'chrome',headless:true});
const shots=resolve(import.meta.dirname,'../../../.tmp/screenshots');await mkdir(shots,{recursive:true});
const errors=[];
try {
  const context=await browser.newContext({viewport:{width:375,height:844},serviceWorkers:'block'});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/#/maps/${mapId}/${mode}/${entry}`);
  await page.getByRole('button',{name:'蓝色',exact:true}).click();
  await page.locator('.map-card-item').click();
  await page.locator('#main-map-img').waitFor();
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.switch-btn').count(),5);
  const fit=await page.locator('#floor-switch-v2').evaluate(el=>el.scrollWidth<=el.clientWidth+1);
  assert(fit,'five short floor labels fit at 375px');
  await page.waitForTimeout(100);
  await page.evaluate(()=>{
    window.floorLayoutReads=0;
    const descriptor=Object.getOwnPropertyDescriptor(HTMLElement.prototype,'offsetLeft');
    Object.defineProperty(HTMLElement.prototype,'offsetLeft',{...descriptor,get(){if(this.classList.contains('switch-btn'))window.floorLayoutReads++;return descriptor.get.call(this);}});
  });
  await page.getByRole('button',{name:'负四楼',exact:true}).click();await page.waitForURL(/b4$/);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.floorLayoutReads),0,'floor animation reuses measured geometry');
  await page.getByRole('button',{name:'全图',exact:true}).click();
  for(const width of [320,375,390,844]) {
    await page.setViewportSize({width,height:width===844?390:844});
    await page.getByRole('button',{name:'负四楼',exact:true}).click();
    await page.waitForURL(/b4$/);
    await page.waitForTimeout(300);
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    assert(await page.locator('.switch-btn').evaluateAll(nodes=>nodes.every(n=>{const height=n.getBoundingClientRect().height;return height>=26&&height<=32&&parseFloat(getComputedStyle(n).fontSize)>=14;})), 'floor capsules keep their original compact height');
    await page.screenshot({path:resolve(shots,`dynamic-floors-${width}.png`)});
    await page.getByRole('button',{name:'全图',exact:true}).click();
  }
  for(const version of [4,5]) {
    const old=await fetch(`${base}/maps-v${version}.json`).then(r=>r.json());
    assert(!old.gameMaps.some(m=>m.id===mapId));
  }
  const stats=await fetch(`${base}/api/admin/stats?mode=${mode}`).then(r=>r.json());
  assert.equal(stats.total,1,'floor switches do not add visits');
  assert.equal(stats.modes[0].label,'深渊');assert.equal(stats.entrances[0].label,'竖井');
  const extended=await admin();
  extended.gameMaps.find(m=>m.id===mapId).difficulties[0].floors.push({id:'lower-observatory',name:'地下观测平台长楼层',sort:10,visible:true});
  extended.layouts.find(l=>l.id===layout.id).floorRegions.regions['lower-observatory']={x:0,y:1200,width:900,height:200};
  const extendedSave=await fetch(`${base}/api/admin/v4/maps`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({config:extended,baseVersion:extended.version})});
  assert.equal(extendedSave.status,200,await extendedSave.text());
  await page.setViewportSize({width:320,height:844});await page.reload();
  await page.getByRole('button',{name:'地下观测平台长楼层',exact:true}).click();
  await page.waitForURL(/lower-observatory$/);await page.waitForTimeout(300);
  assert(await page.locator('#floor-switch-v2').evaluate(el=>el.scrollWidth>el.clientWidth));
  const aligned=await page.locator('#floor-switch-v2').evaluate(el=>{const a=el.querySelector('.switch-btn.active').getBoundingClientRect(),b=el.querySelector('.floor-indicator').getBoundingClientRect();return Math.abs(a.left-b.left)<2&&Math.abs(a.width-b.width)<2;});
  assert(aligned,'indicator stays aligned in the scrolled content');
  await page.screenshot({path:resolve(shots,'dynamic-floors-long-320.png')});
  assert.equal((await fetch(`${base}/api/admin/stats?mode=${mode}`).then(r=>r.json())).total,2,'reload counts once; long-floor switching does not');
  await page.setViewportSize({width:1365,height:900});
  await page.goto(`${base}/admin/#maps`);
  await page.getByRole('button',{name:'磷光症',exact:true}).last().click();
  assert.equal(await page.locator('.floor-list tbody tr').count(),6);
  await page.screenshot({path:resolve(shots,'dynamic-admin.png')});
  await page.getByText('难度字典',{exact:true}).first().click();
  await page.getByRole('button',{name:'新增难度',exact:true}).click();
  await page.getByRole('textbox',{name:'难度名称',exact:true}).last().fill('后续新增难度');
  const response=page.waitForResponse(r=>r.url().endsWith('/api/admin/v4/maps')&&r.request().method()==='PUT');
  await page.getByRole('button',{name:'保存',exact:true}).click();
  assert.equal((await response).status(),200);
  assert((await admin()).difficulties.some(d=>d.name==='后续新增难度'));
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: arbitrary difficulty, four basement floors, custom entry/classification, measured mobile tabs, dynamic text, dictionary editing, legacy projection and statistics.');
} finally {
  await browser.close();
  const current=await admin();
  const restored=await fetch(`${base}/api/admin/v4/restore`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key:`backups-v4/snapshot-v${original.version}.json`,baseVersion:current.version})});
  assert.equal(restored.status,200,await restored.text());
}
