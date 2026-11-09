import test from 'node:test';
import assert from 'node:assert/strict';
import { windowMetrics } from './window-metrics.mjs';

const rectangle = (left, top, width, height) => ({left,top,right:left+width,bottom:top+height,width,height});
const info = (width,height=844) => ({safeArea:{top:47,bottom:height-28,left:0,right:width},menuButtons:{
  back:rectangle(8,50,32,32),share:rectangle(width-88,50,32,32),me:rectangle(width-48,50,32,32),
}});
test('the reserved height ends at the native button bottom without an extra gap',()=>{
  for (const width of [320,375,390,844]) {
    const metrics=windowMetrics(info(width),{width,height:844});
    assert.equal(metrics.top,82); assert.equal(metrics.bottom,28);
    for (const rect of Object.values(info(width).menuButtons)) assert(metrics.top>=rect.bottom);
    if (metrics.logoSide) {
      assert(metrics.logoSide>=100); assert(width-2*metrics.logoSide-20>=192);
    } else assert.equal(metrics.logoTop,metrics.top);
  }
});
test('explicitly hidden native buttons do not reserve an empty navigation row',()=>{
  const metrics=windowMetrics({safeArea:{top:47,bottom:816,left:0,right:390},menuButtons:{back:null,me:null,share:null}},{width:390,height:844});
  assert.equal(metrics.top,47); assert.equal(metrics.logoTop,47);
});
test('unavailable or incomplete button geometry retains the safe fallback row',()=>{
  assert.equal(windowMetrics(null,{width:390,height:844},{top:47,bottom:28}).top,91);
  assert.equal(windowMetrics({safeArea:{top:47},menuButtons:{}},{width:390,height:844}).top,91);
});
test('landscape insets remain local and do not consume screenTop twice',()=>{
  const geometry={...info(844,390),screenTop:100,statusBarHeight:47,safeArea:{top:0,bottom:369,left:44,right:800}};
  geometry.menuButtons={back:rectangle(52,6,32,32),share:rectangle(756,6,32,32),me:null};
  const metrics=windowMetrics(geometry,{width:844,height:390});
  assert.equal(metrics.top,38); assert.equal(metrics.bottom,21); assert.equal(metrics.left,44); assert.equal(metrics.right,44);
});

test('a taller native button reserves enough blank space for the entire original toolbar',()=>{
  const geometry=info(320); geometry.menuButtons.share=rectangle(170,50,80,48);
  const metrics=windowMetrics(geometry,{width:320,height:844});
  assert.equal(metrics.top,98);
});
