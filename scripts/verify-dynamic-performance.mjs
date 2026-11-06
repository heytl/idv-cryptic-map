// Compare the retained legacy serializer with V6 using the same legacy data.
import { build } from '../node_modules/.pnpm/node_modules/esbuild/lib/main.js';
const bundled=await build({stdin:{contents:`
import snapshot from './apps/web/src/data/maps-v3.snapshot.json';
import {toPublicMapConfigV5,validateMapConfigV3,normalizeEntranceRules} from './packages/shared/src/map-v3';
import {normalizeMapConfigV4,toPublicMapConfigV6} from './packages/shared/src/map-v4';
export {snapshot,toPublicMapConfigV5,validateMapConfigV3,normalizeEntranceRules,normalizeMapConfigV4,toPublicMapConfigV6};
`,resolveDir:process.cwd()},bundle:true,platform:'node',format:'esm',write:false});
const {snapshot,toPublicMapConfigV5,validateMapConfigV3,normalizeEntranceRules,normalizeMapConfigV4,toPublicMapConfigV6}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function sample(count) {
  const c=structuredClone(snapshot), pool=c.layouts.filter(l=>l.published&&!l.deletedAt);
  c.layouts=Array.from({length:count},(_,i)=>{const l=structuredClone(pool[i%pool.length]);l.id=i+1;l.entrances.forEach((e,j)=>e.id=`${i+1}-entry-${j}`);return l;});return c;
}
function measure(fn) {for(let i=0;i<20;i++)fn();const times=[];for(let i=0;i<80;i++){const t=performance.now();fn();times.push(performance.now()-t);}times.sort((a,b)=>a-b);return times[Math.floor(times.length*.95)];}
let regression=false;
for(const count of [snapshot.layouts.length,1000]) {
  const old=sample(count), current=normalizeMapConfigV4(old);
  const legacy=()=>JSON.stringify(toPublicMapConfigV5(old,'https://media.test'));
  const dynamic=()=>JSON.stringify(toPublicMapConfigV6(current,'https://media.test'));
  const oldJson=JSON.stringify(old),newJson=JSON.stringify(current);
  const legacyRead=()=>{const value=JSON.parse(oldJson);const checked=validateMapConfigV3(value);if(!checked.valid)throw new Error(checked.errors.join(';'));return JSON.stringify(toPublicMapConfigV5(normalizeEntranceRules(value),'https://media.test'));};
  const dynamicRead=()=>JSON.stringify(toPublicMapConfigV6(normalizeMapConfigV4(JSON.parse(newJson)),'https://media.test'));
  for(const [scope,before,after] of [['serialization',legacy,dynamic],['parse-validation-projection',legacyRead,dynamicRead]]) {
    const rounds=Array.from({length:5},()=>({old:measure(before),current:measure(after)}));
    const median=key=>rounds.map(r=>r[key]).sort((a,b)=>a-b)[2];
    const oldP95=median('old'),currentP95=median('current');
    const increase=currentP95/oldP95-1; regression ||= increase>.1;
    console.log(JSON.stringify({scope,layouts:count,legacyP95ms:+oldP95.toFixed(3),v6P95ms:+currentP95.toFixed(3),increasePercent:+(increase*100).toFixed(1),legacyBytes:Buffer.byteLength(legacy()),v6Bytes:Buffer.byteLength(dynamic()),note:'Local CPU pipeline only; excludes network, production KV and D1 latency.'}));
  }
}
if(regression)process.exitCode=1;
