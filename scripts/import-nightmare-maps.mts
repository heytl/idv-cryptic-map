#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import {
  validateMapConfigV2,
  type AssetRef,
  type DirectionV2,
  type MapConfigV2,
  type MapItemV2,
} from '../packages/shared/src/map-v2.ts';

interface SourceSpec {
  file: string;
  name: string;
  direction: DirectionV2;
  floor1Top: number;
  basementTop: number;
  footerTop: number;
}

/**
 * 这些边界按凉哈皮提供的 1000px 宽原图逐张校准。
 * 每一段都保留对应的楼层标题，但排除下一层与底部图例。
 */
const SOURCES: readonly SourceSpec[] = [
  { file: '北 - Z1门.jpg', name: '北-Z1门', direction: 'north', floor1Top: 840, basementTop: 1660, footerTop: 2200 },
  { file: '北 - b门.png', name: '北-b门', direction: 'north', floor1Top: 900, basementTop: 2000, footerTop: 2720 },
  { file: '北 - 仙人掌门.jpg', name: '北-仙人掌门', direction: 'north', floor1Top: 640, basementTop: 1510, footerTop: 2200 },
  { file: '北 - 回门.jpg', name: '北-回门', direction: 'north', floor1Top: 820, basementTop: 1630, footerTop: 2200 },
  { file: '北 - 骑士门.jpg', name: '北-骑士门', direction: 'north', floor1Top: 740, basementTop: 1500, footerTop: 2200 },
  { file: '南 - 3红门路线图.png', name: '南-3红门', direction: 'south', floor1Top: 850, basementTop: 1780, footerTop: 2350 },
  { file: '南 - H门.jpg', name: '南-H门', direction: 'south', floor1Top: 720, basementTop: 1480, footerTop: 2200 },
  { file: '右 - C门路线图.png', name: '右-C门', direction: 'right', floor1Top: 900, basementTop: 1970, footerTop: 2600 },
  { file: '右 - 一闪电 门.jpg', name: '右-一闪电门', direction: 'right', floor1Top: 860, basementTop: 1660, footerTop: 2200 },
  { file: '右 - 仙人掌门路线图.png', name: '右-仙人掌门', direction: 'right', floor1Top: 850, basementTop: 1750, footerTop: 2200 },
  { file: '右 - 断C门 路线图.jpg', name: '右-断C门', direction: 'right', floor1Top: 770, basementTop: 1590, footerTop: 2200 },
  { file: '右 - 短T门.jpg', name: '右-短T门', direction: 'right', floor1Top: 820, basementTop: 1680, footerTop: 2200 },
  { file: '右 - 长Z门路线图.png', name: '右-长Z门', direction: 'right', floor1Top: 740, basementTop: 1420, footerTop: 1920 },
] as const;

const args = process.argv.slice(2);
const option = (name: string): string | undefined =>
  args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);

const inputDirArg = option('input-dir');
const outputDir = resolve(option('output-dir') ?? '.tmp/nightmare-import');
const mapsApiUrl = option('api-url');
const imageApiUrl = option('image-api-url');
const r2Bucket = option('r2-bucket') ?? 'idv-media';
const onlyNames = option('only')?.split(',').map((name) => name.trim()).filter(Boolean);
const commit = args.includes('--commit');
const updateExisting = args.includes('--update-existing');
const wranglerDirect = args.includes('--wrangler-direct');
const allowNonPreview = args.includes('--allow-non-preview');

if (!inputDirArg) {
  console.error('用法: pnpm import:nightmare -- --input-dir=<单人模式地图目录> [--only=<逻辑名,逻辑名>] [--update-existing] [--output-dir=<检查目录>] [--api-url=<V2地图接口> --image-api-url=<V2图片接口> | --wrangler-direct --r2-bucket=<R2>] [--commit]');
  process.exit(2);
}
if ((mapsApiUrl && !imageApiUrl) || (!mapsApiUrl && imageApiUrl)) {
  console.error('--api-url 与 --image-api-url 必须同时提供。');
  process.exit(2);
}
if (wranglerDirect && (mapsApiUrl || imageApiUrl)) {
  console.error('--wrangler-direct 不能与 API 地址同时使用。');
  process.exit(2);
}
if (commit && (!mapsApiUrl || !imageApiUrl)) {
  if (!wranglerDirect) {
    console.error('--commit 必须同时提供两个 V2 接口地址，或使用 --wrangler-direct。');
    process.exit(2);
  }
}
if (wranglerDirect && !allowNonPreview) {
  console.error('安全保护：--wrangler-direct 直接操作 Cloudflare 资源，必须明确添加 --allow-non-preview。');
  process.exit(2);
}
for (const value of [mapsApiUrl, imageApiUrl]) {
  if (!value) continue;
  const url = new URL(value);
  if (!allowNonPreview && !url.hostname.includes('v2-preview')) {
    console.error(`安全保护：拒绝写入非 V2 预览地址 ${url.hostname}`);
    console.error('只有明确添加 --allow-non-preview 才能解除此保护。');
    process.exit(2);
  }
}

const inputDir = resolve(inputDirArg);
mkdirSync(outputDir, { recursive: true });

const selectedSources = onlyNames
  ? SOURCES.filter((item) => onlyNames.includes(item.name))
  : [...SOURCES];
const unknownNames = onlyNames?.filter((name) => !SOURCES.some((item) => item.name === name)) ?? [];
if (unknownNames.length > 0) {
  throw new Error(`--only 包含未知地图：${unknownNames.join('、')}`);
}
if (selectedSources.length === 0) {
  throw new Error('没有选中任何地图。');
}

const availableFiles = new Set(readdirSync(inputDir));
const missingFiles = selectedSources.filter((item) => !availableFiles.has(item.file));
if (missingFiles.length > 0) {
  throw new Error(`缺少源图：${missingFiles.map((item) => item.file).join('、')}`);
}

interface PreparedMap {
  spec: SourceSpec;
  full: Buffer;
  floor1: Buffer;
  floor2: Buffer;
  basement: Buffer;
}

async function webp(input: Buffer): Promise<Buffer> {
  return sharp(input).webp({ quality: 90, effort: 5 }).toBuffer();
}

async function prepare(spec: SourceSpec): Promise<PreparedMap> {
  const source = readFileSync(join(inputDir, spec.file));
  const metadata = await sharp(source).metadata();
  if (metadata.width !== 1000 || !metadata.height) {
    throw new Error(`${spec.file} 尺寸应为 1000px 宽，实际为 ${metadata.width ?? '?'}×${metadata.height ?? '?'}`);
  }
  if (!(0 < spec.floor1Top && spec.floor1Top < spec.basementTop && spec.basementTop < spec.footerTop && spec.footerTop <= metadata.height)) {
    throw new Error(`${spec.file} 的裁剪边界不合法`);
  }

  const [full, floor2, floor1, basement] = await Promise.all([
    webp(source),
    sharp(source).extract({ left: 0, top: 0, width: 1000, height: spec.floor1Top }).webp({ quality: 90, effort: 5 }).toBuffer(),
    sharp(source).extract({ left: 0, top: spec.floor1Top, width: 1000, height: spec.basementTop - spec.floor1Top }).webp({ quality: 90, effort: 5 }).toBuffer(),
    sharp(source).extract({ left: 0, top: spec.basementTop, width: 1000, height: spec.footerTop - spec.basementTop }).webp({ quality: 90, effort: 5 }).toBuffer(),
  ]);

  const safeName = spec.name.replaceAll('/', '-');
  const mapDir = join(outputDir, safeName);
  mkdirSync(mapDir, { recursive: true });
  writeFileSync(join(mapDir, 'full.webp'), full);
  writeFileSync(join(mapDir, 'floor2.webp'), floor2);
  writeFileSync(join(mapDir, 'floor1.webp'), floor1);
  writeFileSync(join(mapDir, 'basement.webp'), basement);
  return { spec, full, floor1, floor2, basement };
}

async function makeContactSheet(items: PreparedMap[], floor: 'floor2' | 'floor1' | 'basement'): Promise<void> {
  const tileWidth = 300;
  const tileHeight = 360;
  const columns = 4;
  const rows = Math.ceil(items.length / columns);
  const canvas = sharp({ create: { width: columns * tileWidth, height: rows * tileHeight, channels: 3, background: '#111820' } });
  const composites: sharp.OverlayOptions[] = [];

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    const column = index % columns;
    const row = Math.floor(index / columns);
    const thumb = await sharp(item[floor])
      .resize({ width: tileWidth - 20, height: tileHeight - 48, fit: 'inside', withoutEnlargement: true })
      .toBuffer();
    const thumbMeta = await sharp(thumb).metadata();
    const left = column * tileWidth + Math.floor((tileWidth - (thumbMeta.width ?? 0)) / 2);
    const top = row * tileHeight + 34 + Math.floor((tileHeight - 48 - (thumbMeta.height ?? 0)) / 2);
    const label = Buffer.from(`<svg width="${tileWidth}" height="34"><rect width="100%" height="100%" fill="#111820"/><text x="${tileWidth / 2}" y="24" text-anchor="middle" fill="#e4bd65" font-size="18" font-family="PingFang SC, sans-serif">${item.spec.name}</text></svg>`);
    composites.push({ input: label, left: column * tileWidth, top: row * tileHeight });
    composites.push({ input: thumb, left, top });
  }
  await canvas.composite(composites).webp({ quality: 88 }).toFile(join(outputDir, `检查-${floor}.webp`));
}

function runWrangler(args: string[], input?: string): string {
  return execFileSync('pnpm', ['exec', 'wrangler', ...args], {
    cwd: resolve('.'),
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'inherit'],
  });
}

async function upload(
  kind: 'full' | 'basement' | 'floor1' | 'floor2',
  buffer: Buffer,
  localPath: string,
): Promise<AssetRef> {
  if (wranglerDirect) {
    const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 8);
    const key = `maps/layout/${kind}/${hash}.webp`;
    runWrangler([
      'r2', 'object', 'put', `${r2Bucket}/${key}`,
      '--file', localPath,
      '--content-type', 'image/webp',
      '--cache-control', 'public, max-age=31536000, immutable',
      '--remote',
      '--force',
    ]);
    return { key };
  }
  const form = new FormData();
  form.append('kind', kind);
  form.append('file', new Blob([buffer], { type: 'image/webp' }), `${kind}.webp`);
  const response = await fetch(imageApiUrl!, { method: 'POST', body: form });
  if (!response.ok) throw new Error(`上传 ${kind} 失败：HTTP ${response.status} ${await response.text()}`);
  const result = await response.json() as { asset?: AssetRef };
  if (!result.asset?.key) throw new Error(`上传 ${kind} 返回缺少图片地址`);
  return result.asset;
}

console.log(`正在生成 ${selectedSources.length} 张噩梦地图的全图和三层图……`);
const prepared: PreparedMap[] = [];
for (const spec of selectedSources) {
  prepared.push(await prepare(spec));
  console.log(`已裁剪 ${spec.name}`);
}
await Promise.all([
  makeContactSheet(prepared, 'floor2'),
  makeContactSheet(prepared, 'floor1'),
  makeContactSheet(prepared, 'basement'),
]);

if (!commit) {
  console.log(`仅生成检查图，没有写入 Cloudflare：${outputDir}`);
  process.exit(0);
}

let current: MapConfigV2;
if (wranglerDirect) {
  current = JSON.parse(runWrangler([
    'kv', 'key', 'get', 'config:v2:current',
    '--binding', 'CONFIG',
    '--remote',
    '--text',
  ])) as MapConfigV2;
} else {
  const currentResponse = await fetch(mapsApiUrl!, { headers: { Accept: 'application/json' } });
  if (!currentResponse.ok) throw new Error(`读取当前 V2 配置失败：HTTP ${currentResponse.status}`);
  current = await currentResponse.json() as MapConfigV2;
}
const existingByName = new Map(
  current.maps
    .filter((map) => map.mode === 'nightmare' && !map.deletedAt)
    .map((map) => [map.name, map]),
);
if (updateExisting) {
  const missingMaps = selectedSources.filter((spec) => !existingByName.has(spec.name));
  if (missingMaps.length > 0) {
    throw new Error(`以下噩梦地图不存在，无法更新：${missingMaps.map((item) => item.name).join('、')}`);
  }
} else {
  const duplicates = selectedSources.filter((spec) => existingByName.has(spec.name));
  if (duplicates.length > 0) {
    throw new Error(`以下噩梦地图已经存在，已停止以避免重复：${duplicates.map((item) => item.name).join('、')}`);
  }
}

let nextId = Math.max(0, ...current.maps.map((map) => map.id)) + 1;
let nextSort = Math.max(0, ...current.maps.map((map) => map.sort)) + 10;
const importedMaps: MapItemV2[] = [];
const updatedMaps = new Map<string, MapItemV2>();
const uploadedKeys: string[] = [];

for (const item of prepared) {
  const mapDir = join(outputDir, item.spec.name.replaceAll('/', '-'));
  const [full, basement, floor1, floor2] = await Promise.all([
    upload('full', item.full, join(mapDir, 'full.webp')),
    upload('basement', item.basement, join(mapDir, 'basement.webp')),
    upload('floor1', item.floor1, join(mapDir, 'floor1.webp')),
    upload('floor2', item.floor2, join(mapDir, 'floor2.webp')),
  ]);
  uploadedKeys.push(full.key, basement.key, floor1.key, floor2.key);
  if (updateExisting) {
    const existing = existingByName.get(item.spec.name)!;
    updatedMaps.set(item.spec.name, {
      ...existing,
      layout: { ...existing.layout, full, basement, floor1, floor2 },
    });
    console.log(`已上传 ${item.spec.name} 的新版楼层图`);
    continue;
  }
  const id = nextId++;
  importedMaps.push({
    id,
    mode: 'nightmare',
    name: item.spec.name,
    displayName: item.spec.name,
    remarks: '噩梦路线图已自动导入；正门、二楼门入口图待手动裁剪。',
    sort: nextSort,
    published: false,
    layout: { full, basement, floor1, floor2 },
    entrances: [
      { id: `${id}-front`, type: 'front', direction: item.spec.direction },
      { id: `${id}-upstairs`, type: 'upstairs', direction: item.spec.direction },
    ],
  });
  nextSort += 10;
  console.log(`已上传 ${item.spec.name}`);
}

const nextMaps = updateExisting
  ? current.maps.map((map) => updatedMaps.get(map.name) ?? map)
  : [...current.maps, ...importedMaps];
const nextConfig: MapConfigV2 = {
  schemaVersion: 2,
  version: current.version + 1,
  updatedAt: new Date().toISOString().slice(0, 10),
  maps: nextMaps,
};
const validation = validateMapConfigV2(nextConfig);
if (!validation.valid) throw new Error(`导入后的 V2 数据校验失败：\n${validation.errors.join('\n')}`);

let saved: { version?: number; updatedAt?: string };
let backupKey: string | undefined;
if (wranglerDirect) {
  const latest = JSON.parse(runWrangler([
    'kv', 'key', 'get', 'config:v2:current',
    '--binding', 'CONFIG',
    '--remote',
    '--text',
  ])) as MapConfigV2;
  if (latest.version !== current.version) {
    throw new Error(`V2 版本冲突：读取时为 v${current.version}，写入前已变为 v${latest.version}`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(outputDir, `backup-v${current.version}-before-update.json`);
  const configPath = join(outputDir, `config-v${nextConfig.version}.json`);
  backupKey = `backups-v2/${stamp}-v${current.version}.json`;
  writeFileSync(backupPath, `${JSON.stringify(current)}\n`);
  writeFileSync(configPath, `${JSON.stringify(nextConfig)}\n`);
  runWrangler([
    'r2', 'object', 'put', `${r2Bucket}/${backupKey}`,
    '--file', backupPath,
    '--content-type', 'application/json',
    '--remote',
    '--force',
  ]);
  runWrangler([
    'kv', 'key', 'put', 'config:v2:current',
    '--binding', 'CONFIG',
    '--remote',
    '--path', configPath,
  ]);
  saved = { version: nextConfig.version, updatedAt: nextConfig.updatedAt };
} else {
  const writeResponse = await fetch(mapsApiUrl!, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ baseVersion: current.version, maps: nextConfig.maps }),
  });
  if (!writeResponse.ok) throw new Error(`保存 V2 配置失败：HTTP ${writeResponse.status} ${await writeResponse.text()}`);
  saved = await writeResponse.json() as { version?: number; updatedAt?: string };
}

writeFileSync(join(outputDir, 'import-result.json'), `${JSON.stringify({
  operation: updateExisting ? 'update' : 'add',
  previousVersion: current.version,
  savedVersion: saved.version,
  ...(backupKey ? { backupKey } : {}),
  maps: updateExisting
    ? [...updatedMaps.values()].map((map) => ({ id: map.id, name: map.name, published: map.published }))
    : importedMaps.map((map) => ({ id: map.id, name: map.name, direction: map.entrances[0]?.direction, published: map.published })),
  uploadedKeys,
}, null, 2)}\n`);
console.log(updateExisting
  ? `完成：已更新 ${updatedMaps.size} 张噩梦地图，V2 配置为 v${saved.version ?? '?'}。`
  : `完成：已新增 ${importedMaps.length} 张噩梦地图草稿，V2 配置为 v${saved.version ?? '?'}。`);
