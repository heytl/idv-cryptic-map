import assert from 'node:assert/strict';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { prepareImage } from './media-profile.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const out = resolve(root, 'dist/minitool');
const deps = await readdir(resolve(root,'node_modules/.pnpm'));
const acornDir = deps.filter(name => /^acorn@8\./.test(name)).sort().at(-1);
assert(acornDir, 'Use the existing installed Acorn dependency');
const require = createRequire(import.meta.url);
const { parse } = require(resolve(root,'node_modules/.pnpm',acornDir,'node_modules/acorn'));
const js = await readFile(resolve(out,'app.js'),'utf8');
const build = JSON.parse(await readFile(resolve(root,'.tmp/minitool/build.json'),'utf8'));
const expected = JSON.parse(await readFile(resolve(root,build.configPath),'utf8'));
const { mediaReferences } = await import(pathToFileURL(resolve(root,'.tmp/minitool/static-lib.mjs')).href);
if (build.source.kind === 'git-snapshot') {
  for (const [item,key] of mediaReferences(expected)) item[key] = './assets' + item[key];
} else {
  const capture = JSON.parse(await readFile(resolve(dirname(resolve(root,build.configPath)),'capture.json'),'utf8'));
  const media = new Map(capture.mediaIndex.map(item=>[item.source,item.path]));
  for (const [item,key] of mediaReferences(expected)) {
    const path = media.get(new URL(item[key],build.source.url).href);
    assert(path,'Expected captured media'); item[key] = './assets/' + path;
  }
}
if (build.mediaProfile) {
  const profile = JSON.parse(await readFile(resolve(root, build.mediaProfile.manifest), 'utf8'));
  assert.equal(profile.quality, build.mediaProfile.quality);
  assert.equal(profile.resize, false);
  const mapping = new Map(profile.assets.map(item => [item.sourcePath, item]));
  const used = new Set();
  const sourceRoot = build.source.kind === 'git-snapshot' ? resolve(root,'.tmp/minitool',build.snapshotSha,'site') : dirname(resolve(root,build.configPath));
  const sharp = profile.quality === null ? null : createRequire(resolve(root,'apps/web/package.json'))('sharp');
  for (const [item,key] of mediaReferences(expected)) {
    const sourcePath = item[key].replace(/^\.\/assets\//, '');
    const asset = mapping.get(sourcePath);
    assert(asset, 'Missing media derivation: ' + sourcePath);
    used.add(sourcePath); item[key] = './assets/' + asset.path;
  }
  assert.equal(used.size, mapping.size, 'Unexpected or missing derived media');
  for (const asset of profile.assets) {
    const original = await readFile(resolve(sourceRoot,asset.sourcePath));
    const output = await readFile(resolve(out,'assets',asset.path));
    assert.equal(createHash('sha256').update(original).digest('hex'),asset.sourceSha256,'Captured source changed');
    assert.equal(createHash('sha256').update(output).digest('hex'),asset.sha256,'Derived media changed');
    assert.equal(asset.path,`media/${asset.sha256}.webp`);
    assert.equal(output.length,asset.bytes);
    if (profile.quality === null) assert.deepEqual(output,original);
    else {
      const regenerated = await prepareImage(original,asset.sourcePath,profile.quality,sharp);
      assert.deepEqual(output,regenerated.bytes,'Derived media does not match declared quality');
      assert.deepEqual(asset,regenerated.record,'Derived media metadata differs');
    }
  }
}
// A parser gate, rather than keyword guesses, catches unsupported final syntax.
const ast = parse(js, { ecmaVersion: 2017, sourceType: 'script' });
const forbidden = new Set(['fetch','XMLHttpRequest','WebSocket','EventSource','RTCPeerConnection','Worker','SharedWorker','Function','eval']);
const bannedMembers = new Set(['serviceWorker','clipboard','execCommand','getCurrentPosition','watchPosition','getDisplayMedia','enumerateDevices','requestFullscreen','webkitRequestFullscreen','WebAssembly','OffscreenCanvas']);
const resources = new Set(); let nodes = 0, snapshots = 0;
function constant(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(constant);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(property=>{
    assert(property.type === 'Property' && !property.computed);
    return [property.key.name ?? property.key.value,constant(property.value)];
  }));
  if (node.type === 'UnaryExpression' && node.operator === '-') return -constant(node.argument);
  if (node.type === 'UnaryExpression' && node.operator === '!') return !constant(node.argument);
  throw Error('Snapshot must remain a constant: ' + node.type);
}
function visit(node) {
  if (!node || typeof node !== 'object') return;
  nodes++;
  if (node.type === 'ObjectExpression') {
    const version = node.properties.find(property=>property.type==='Property' && (property.key.name ?? property.key.value)==='schemaVersion');
    const layouts = node.properties.find(property=>property.type==='Property' && (property.key.name ?? property.key.value)==='layouts');
    if (version?.value.value === 6 && layouts?.value.type === 'ArrayExpression') {
      assert.deepEqual(constant(node),expected,'Embedded map snapshot differs from the captured source'); snapshots++;
    }
  }
  if ((node.type === 'CallExpression' || node.type === 'NewExpression') && node.callee.type === 'Identifier') assert(!forbidden.has(node.callee.name), 'Forbidden call: ' + node.callee.name);
  if (node.type === 'MemberExpression') {
    const property = node.computed ? node.property.value : node.property.name;
    assert(!bannedMembers.has(property), 'Forbidden capability: ' + property);
  }
  if (node.type === 'Literal' && typeof node.value === 'string') {
    if (/^\.\/(?:assets|icons|static)\//.test(node.value)) resources.add(node.value.slice(2));
    if (/^data:[^,]+;base64,/.test(node.value)) assert(Buffer.from(node.value.split(',')[1],'base64').length <= 1024*1024,'Oversized Base64');
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === 'object') visit(value);
  }
}
visit(ast);
assert.equal(snapshots,1,'Exactly one complete captured map snapshot is embedded');
const html = await readFile(resolve(out,'index.html'),'utf8');
assert(/<!doctype html>/i.test(html) && html.includes('lang="zh-CN"') && html.includes('charset="UTF-8"'));
assert(html.includes('viewport-fit=cover'));
assert(!/<(?:base|iframe|object)\b|\bon\w+\s*=|type=["']module|javascript:/i.test(html));
assert(!/<script(?![^>]+src=)[^>]*>/i.test(html));
for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) { assert(match[1].startsWith('./')); resources.add(match[1].slice(2)); }
const cssFiles = (await readdir(resolve(out,'assets'))).filter(name=>name.endsWith('.css'));
const requireWeb = createRequire(resolve(root,'apps/web/package.json'));
const requireVite = createRequire(requireWeb.resolve('vite/package.json'));
const postcss = requireVite('postcss');
let cssBytes = 0;
for (const name of cssFiles) {
  const css = await readFile(resolve(out,'assets',name),'utf8'); cssBytes += Buffer.byteLength(css);
  postcss.parse(css); // Also catches malformed generated fallback declarations.
  for (const match of css.matchAll(/url\((?:["']?)([^)'"\s]+)(?:["']?)\)/g)) {
    assert(!/^(?:https?:|\/\/|data:)/i.test(match[1]),'External or embedded CSS resource');
    const path = resolve(out,'assets',match[1]); assert(path.startsWith(out)); assert((await stat(path)).isFile());
  }
}
for (const path of resources) assert((await stat(resolve(out,path))).isFile(), 'Missing resource: '+path);
const marker = JSON.parse(await readFile(resolve(out,'mini_tool.json'),'utf8'));
assert.deepEqual(marker,{is_high_consumption_scene:false});
const report = { result:'pass', ecmaVersion:2017, chromeTarget:61, astNodes:nodes, referencedResources:resources.size,
  embeddedSnapshotMatchesSource:true, sourceKind:build.source.kind, sourceDataVersion:build.sourceDataVersion, sourceConfigSha256:build.sourceConfigSha256,
  jsBytes:Buffer.byteLength(js), cssBytes, highConsumption:false,
  appSha256:createHash('sha256').update(js).digest('hex'),
  scope:'Static package gate; platform simulator, Android and iOS validation pending' };
await writeFile(resolve(root,'.tmp/minitool/audit.json'),JSON.stringify(report,null,2)+'\n');
console.log('MINITOOL_AUDIT:'+JSON.stringify(report));
